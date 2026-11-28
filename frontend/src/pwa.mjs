export const INSTALL_DISMISSAL_KEY = "pocketnet.install-dismissed-until";
export const INSTALL_DISMISSAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function isStandaloneMode(navigatorRef, windowRef) {
  return navigatorRef.standalone === true
    || Boolean(windowRef.matchMedia?.("(display-mode: standalone)").matches);
}

export function isAppleMobileDevice(navigatorRef) {
  return /iPhone|iPad|iPod/i.test(navigatorRef.userAgent || "")
    || (navigatorRef.platform === "MacIntel" && navigatorRef.maxTouchPoints > 1);
}

export function getInstallGuide({ appleMobile, appleSafari, userAgent = "" }) {
  if (appleMobile) {
    return {
      eyebrow: "INSTALLATION SUR APPLE",
      title: appleSafari ? "Ajouter PocketNet à l’écran d’accueil" : "Ouvrir PocketNet dans Safari",
      hint: appleSafari
        ? "Safari installe le site comme une application web autonome sur iPhone et iPad."
        : "Pour une installation web autonome sur iPhone ou iPad, ouvrez d’abord PocketNet dans Safari.",
      steps: [
        "Dans Safari, appuyez sur le bouton Partager.",
        "Choisissez Ajouter à l’écran d’accueil.",
        "Confirmez avec Ajouter.",
      ],
    };
  }

  const isAndroidChrome = /Android/i.test(userAgent)
    && /Chrome/i.test(userAgent)
    && !/(EdgA|OPR|SamsungBrowser)/i.test(userAgent);
  return {
    eyebrow: "INSTALLATION DANS LE NAVIGATEUR",
    title: "Vérifier l’installation de PocketNet",
    hint: isAndroidChrome
      ? "L’invite native n’est pas disponible pour cette visite. Dans le menu Chrome, utilisez uniquement « Installer l’application » ou « Installer PocketNet » si cette option est proposée."
      : "L’invite native n’est pas disponible pour cette visite. Utilisez uniquement une option explicitement nommée « Installer l’application » ou « Installer PocketNet » si votre navigateur la propose.",
    steps: [
      "Ouvrez le menu du navigateur.",
      "Choisissez l’option explicite d’installation de l’application, si elle existe.",
      "Si vous ne voyez que « Créer un raccourci » ou une option de favori, annulez : ce n’est pas une installation PWA.",
    ],
  };
}

export function wasInstallDismissed(storage, now = Date.now()) {
  if (!storage) return false;
  try {
    const expiresAt = Number(storage.getItem(INSTALL_DISMISSAL_KEY));
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      storage.removeItem(INSTALL_DISMISSAL_KEY);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Impossible de lire la préférence d’installation PocketNet.", error);
    return false;
  }
}

export function dismissInstallInvitation(storage, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(
      INSTALL_DISMISSAL_KEY,
      String(now + INSTALL_DISMISSAL_DURATION_MS),
    );
  } catch (error) {
    console.warn("Impossible d’enregistrer la fermeture de l’invitation PocketNet.", error);
  }
}

function getLocalStorage(windowRef) {
  try {
    return windowRef.localStorage;
  } catch (error) {
    console.warn("Le stockage local ne permet pas de mémoriser les préférences PWA.", error);
    return null;
  }
}

export function initializePwa({
  windowRef = window,
  navigatorRef = navigator,
  documentRef = document,
  isSimulationBusy = () => false,
} = {}) {
  const noticeStack = documentRef.querySelector(".pwa-notices");
  const offlineNotice = documentRef.querySelector("#pwa-offline-notice");
  const installNotice = documentRef.querySelector("#pwa-install-notice");
  const installDescription = documentRef.querySelector("#pwa-install-description");
  const installAction = documentRef.querySelector("#pwa-install-action");
  const installDismiss = documentRef.querySelector("#pwa-install-dismiss");
  const installGuide = documentRef.querySelector("#pwa-install-guide");
  const installGuideEyebrow = documentRef.querySelector("#pwa-install-guide-eyebrow");
  const installGuideTitle = documentRef.querySelector("#pwa-install-guide-title");
  const installGuideHint = documentRef.querySelector("#pwa-install-guide-hint");
  const installGuideSteps = documentRef.querySelector("#pwa-install-guide-steps");
  const updateNotice = documentRef.querySelector("#pwa-update-notice");
  const updateAction = documentRef.querySelector("#pwa-update-action");
  const connectionIndicator = documentRef.querySelector(".online-dot");
  const storage = getLocalStorage(windowRef);
  const appleMobile = isAppleMobileDevice(navigatorRef);
  const userAgent = navigatorRef.userAgent || "";
  const appleSafari = appleMobile
    && /Safari/i.test(userAgent)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent);

  let dismissed = wasInstallDismissed(storage);
  let installed = isStandaloneMode(navigatorRef, windowRef);
  let deferredInstallPrompt = null;
  let installFallbackReady = false;
  let registration = null;
  let waitingWorker = null;
  let reloadAfterActivation = false;
  let updateReadyForReload = false;

  function updateNoticeStack() {
    noticeStack.hidden = offlineNotice.hidden && installNotice.hidden && updateNotice.hidden;
  }

  function hideInstallInvitation() {
    installNotice.hidden = true;
    updateNoticeStack();
  }

  function renderInstallInvitation() {
    if (installed || dismissed || (!appleMobile && !deferredInstallPrompt && !installFallbackReady)) {
      hideInstallInvitation();
      return;
    }
    installDescription.textContent = deferredInstallPrompt
      ? "Installez PocketNet comme application dans une fenêtre dédiée."
      : appleMobile
        ? "Ajoutez PocketNet à votre écran d’accueil pour l’ouvrir comme une application."
        : "Aucune invite native n’est disponible ici. Consultez les instructions sans créer de raccourci.";
    installAction.textContent = deferredInstallPrompt ? "Installer" : "Instructions";
    installNotice.hidden = false;
    updateNoticeStack();
  }

  function showInstallGuide() {
    const guide = getInstallGuide({
      appleMobile,
      appleSafari,
      userAgent,
    });
    installGuideEyebrow.textContent = guide.eyebrow;
    installGuideTitle.textContent = guide.title;
    installGuideHint.textContent = guide.hint;
    installGuideSteps.replaceChildren(...guide.steps.map((step) => {
      const item = documentRef.createElement("li");
      item.textContent = step;
      return item;
    }));
    if (!installGuide.open) installGuide.showModal();
  }

  function updateConnectivity() {
    const offline = navigatorRef.onLine === false;
    offlineNotice.hidden = !offline;
    if (connectionIndicator) {
      connectionIndicator.classList.toggle("is-offline", offline);
      connectionIndicator.title = offline ? "Connexion Internet indisponible" : "Application disponible";
      connectionIndicator.setAttribute(
        "aria-label",
        offline ? "Connexion Internet indisponible" : "Application disponible",
      );
    }
    updateNoticeStack();
  }

  function offerUpdate(worker) {
    waitingWorker = worker;
    updateReadyForReload = false;
    updateAction.textContent = "Mettre à jour";
    updateNotice.hidden = false;
    updateNoticeStack();
  }

  installDismiss.addEventListener("click", () => {
    dismissed = true;
    dismissInstallInvitation(storage);
    hideInstallInvitation();
  });

  installAction.addEventListener("click", async () => {
    if (appleMobile || !deferredInstallPrompt) {
      showInstallGuide();
      return;
    }

    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installed = true;
        hideInstallInvitation();
      } else {
        installFallbackReady = true;
        renderInstallInvitation();
      }
    } catch (error) {
      console.error("L’invite native d’installation de PocketNet a échoué.", error);
      installFallbackReady = true;
      renderInstallInvitation();
    }
  });

  documentRef.querySelectorAll("[data-close-pwa-guide]").forEach((button) => {
    button.addEventListener("click", () => installGuide.close());
  });

  windowRef.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installFallbackReady = false;
    renderInstallInvitation();
  });

  windowRef.addEventListener("appinstalled", () => {
    installed = true;
    deferredInstallPrompt = null;
    hideInstallInvitation();
  });

  windowRef.addEventListener("online", updateConnectivity);
  windowRef.addEventListener("offline", updateConnectivity);
  windowRef.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", (event) => {
    installed = event.matches || navigatorRef.standalone === true;
    renderInstallInvitation();
  });

  updateConnectivity();
  renderInstallInvitation();
  windowRef.setTimeout(() => {
    if (!installed && !dismissed && !deferredInstallPrompt) {
      installFallbackReady = true;
      renderInstallInvitation();
    }
  }, 2500);

  if ("serviceWorker" in navigatorRef) {
    const registerServiceWorker = async () => {
      try {
        registration = await navigatorRef.serviceWorker.register("/service-worker.js", {
          updateViaCache: "none",
        });
        const alreadyControlled = Boolean(navigatorRef.serviceWorker.controller);

        if (registration.waiting && alreadyControlled) {
          offerUpdate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed"
              && navigatorRef.serviceWorker.controller
              && registration.waiting) {
              offerUpdate(registration.waiting);
            }
          });
        });

        navigatorRef.serviceWorker.addEventListener("controllerchange", () => {
          if (reloadAfterActivation) {
            windowRef.location.reload();
          } else if (alreadyControlled) {
            waitingWorker = null;
            updateReadyForReload = true;
            updateAction.textContent = "Recharger";
            updateNotice.hidden = false;
            updateNoticeStack();
          }
        });
      } catch (error) {
        console.error("L’enregistrement du service worker PocketNet a échoué.", error);
      }
    };

    if (documentRef.readyState === "complete") {
      registerServiceWorker();
    } else {
      windowRef.addEventListener("load", registerServiceWorker, { once: true });
    }
  }

  updateAction.addEventListener("click", () => {
    if (isSimulationBusy()
      && !windowRef.confirm("Une commande réseau est en cours. Rechargez-vous quand même ?")) {
      return;
    }
    if (waitingWorker && registration?.waiting === waitingWorker) {
      reloadAfterActivation = true;
      waitingWorker.postMessage({ type: "ACTIVATE_UPDATE" });
      return;
    }
    if (updateReadyForReload) windowRef.location.reload();
  });
}
