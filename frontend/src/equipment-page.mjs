import { initializePwa } from "./pwa.mjs";

const shell = document.querySelector(".equipment-page-shell");
const status = document.querySelector("#equipment-status");
const content = document.querySelector("#equipment-content");
const title = document.querySelector("#equipment-page-title");

const equipmentDetails = {
  ordinateur: {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b6/A_person_working_on_old_desktop_computer.jpg/960px-A_person_working_on_old_desktop_computer.jpg",
    imageAlt: "Une personne travaille sur un ordinateur de bureau avec écran et tour.",
    source: "https://commons.wikimedia.org/wiki/File:A_person_working_on_old_desktop_computer.jpg",
    attribution: "Kskhh",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    explanation: "C’est le poste de travail qui échange des informations avec le reste du réseau. Il envoie des données et reçoit des réponses grâce à sa carte réseau.",
    analogy: "Imaginez une maison avec une adresse : l’ordinateur utilise des adresses réseau pour que les informations trouvent le bon destinataire.",
    takeaways: ["C’est un hôte du réseau.", "Il possède des adresses réseau.", "Dans PocketNet, le PC peut être configuré et tester des échanges."],
  },
  "switch-ethernet": {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Network_switches.jpg/960px-Network_switches.jpg",
    imageAlt: "Deux switches Ethernet reliés à des câbles réseau.",
    source: "https://commons.wikimedia.org/wiki/File:Network_switches.jpg",
    attribution: "Jon “ShakataGaNai” Davis",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    explanation: "Le switch relie plusieurs appareils dans un même réseau local. Il apprend où se trouvent les appareils et envoie chaque trame vers le bon port.",
    analogy: "Comme un accueil qui connaît le bureau de chaque personne, il dirige les données vers la bonne prise réseau.",
    takeaways: ["Il commute des trames Ethernet.", "Il apprend les adresses MAC.", "PocketNet simule les VLAN et une partie des commandes d’un Catalyst 2960."],
  },
  routeur: {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/ASUS_Wi-Fi_ROUTER_TUF_6500.jpg/960px-ASUS_Wi-Fi_ROUTER_TUF_6500.jpg",
    imageAlt: "Photographie d’un routeur Wi-Fi ASUS.",
    source: "https://commons.wikimedia.org/wiki/File:ASUS_Wi-Fi_ROUTER_TUF_6500.jpg",
    attribution: "Dinkun Chen",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    explanation: "Le routeur relie des réseaux IP différents. Il lit l’adresse de destination d’un paquet et choisit où le transmettre.",
    analogy: "À un carrefour, les panneaux indiquent la route à suivre ; la table de routage joue ce rôle pour les paquets.",
    takeaways: ["Il transfère des paquets entre réseaux.", "Il consulte une table de routage.", "PocketNet prend en charge le routage IPv4 statique, pas les protocoles dynamiques."],
  },
  laptop: {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Laptop%2C_Small_notebook%2C_Netbook%2C_Rostov-on-Don%2C_Russia.jpg/960px-Laptop%2C_Small_notebook%2C_Netbook%2C_Rostov-on-Don%2C_Russia.jpg",
    imageAlt: "Un ordinateur portable posé sur une table.",
    source: "https://commons.wikimedia.org/wiki/File:Laptop,_Small_notebook,_Netbook,_Rostov-on-Don,_Russia.jpg",
    attribution: "Vyacheslav Argenberg",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    explanation: "Le laptop est un ordinateur portable qui joue le rôle d’un hôte. Il peut rejoindre un réseau depuis différents endroits, par câble ou par Wi-Fi.",
    analogy: "C’est un poste de travail que l’on peut déplacer : il reste un utilisateur du réseau, pas un appareil qui dirige le trafic des autres.",
    takeaways: ["C’est un terminal mobile.", "Il utilise les services du réseau comme un ordinateur.", "Dans PocketNet, sa prise en charge est partielle."],
  },
  serveur: {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/74/Servers_in_a_Rack.jpg/960px-Servers_in_a_Rack.jpg",
    imageAlt: "Plusieurs serveurs installés dans une baie informatique.",
    source: "https://commons.wikimedia.org/wiki/File:Servers_in_a_Rack.jpg",
    attribution: "Abigor",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    explanation: "Un serveur met une ressource à disposition d’autres appareils : par exemple un site Web, un service de noms ou des fichiers.",
    analogy: "Comme une bibliothèque qui répond aux demandes des visiteurs, il attend les requêtes des clients puis fournit le service demandé.",
    takeaways: ["Il fournit un service à des clients.", "Un serveur peut être un ordinateur physique ou un logiciel.", "Dans PocketNet, il est visible dans les schémas, mais ses services ne sont pas simulés."],
  },
  "point-acces-wifi": {
    image: "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/Outdoors_Wireless_Access_Point.jpg/960px-Outdoors_Wireless_Access_Point.jpg",
    imageAlt: "Un point d’accès Wi-Fi extérieur fixé sur un mur.",
    source: "https://commons.wikimedia.org/wiki/File:Outdoors_Wireless_Access_Point.jpg",
    attribution: "Mbrickn",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    explanation: "Le point d’accès permet aux appareils Wi-Fi de rejoindre le réseau local. Il fait le lien entre la connexion radio et le réseau câblé.",
    analogy: "C’est comme une porte d’entrée sans fil vers le réseau : les appareils à proximité peuvent s’y connecter.",
    takeaways: ["Il relie des clients Wi-Fi au réseau local.", "Le nom du réseau Wi-Fi est souvent appelé SSID.", "Dans PocketNet, le point d’accès est visuel ; l’association radio n’est pas simulée."],
  },
};

function makeElement(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeLink(href, text, className = "") {
  const link = makeElement("a", className, text);
  link.href = href;
  return link;
}

function makePhoto(details, className = "") {
  const figure = makeElement("figure", `equipment-photo ${className}`.trim());
  const image = makeElement("img");
  image.src = details.image;
  image.alt = details.imageAlt;
  image.loading = className.includes("detail") ? "eager" : "lazy";
  image.decoding = "async";
  figure.append(image);

  const caption = makeElement("figcaption", "equipment-photo-credit");
  caption.append(document.createTextNode("Photo : "));
  caption.append(makeLink(details.source, details.attribution, ""));
  caption.append(document.createTextNode(" · "));
  caption.append(makeLink(details.licenseUrl, details.license, ""));
  caption.append(document.createTextNode(" · image redimensionnée pour l’affichage"));
  figure.append(caption);
  return figure;
}

function renderCatalog(equipment) {
  const introduction = makeElement(
    "p",
    "equipment-catalog-intro",
    "Prenez le temps d’observer chaque appareil : ce qu’il fait dans un vrai réseau, comment le reconnaître et ce que vous pouvez réellement expérimenter dans PocketNet.",
  );
  const grid = makeElement("div", "equipment-explorer-grid");

  equipment.forEach((item) => {
    const details = equipmentDetails[item.slug];
    if (!details) throw new Error(`Aucune photo créditée n’est définie pour « ${item.name} ».`);

    const card = makeElement("article", "equipment-explorer-card");
    card.append(makePhoto(details));
    const body = makeElement("div", "equipment-explorer-card-body");
    body.append(
      makeElement("span", `capability-status${item.availability === "simulated" ? " capability-active" : ""}`, item.availability_label),
      makeElement("h2", "", item.name),
      makeElement("p", "", details.explanation),
      makeLink(`/equipements/${encodeURIComponent(item.slug)}/`, "Découvrir l’équipement →", "public-text-link"),
    );
    card.append(body);
    grid.append(card);
  });

  content.replaceChildren(introduction, grid);
  title.textContent = "Rencontrez les équipements réseau";
  document.title = "Découvrir les équipements réseau — PocketNet";
  status.textContent = `${equipment.length} fiches d’équipements disponibles.`;
}

function renderDetail(item) {
  const details = equipmentDetails[item.slug];
  if (!details) throw new Error(`Aucune photo créditée n’est définie pour « ${item.name} ».`);

  title.textContent = item.name;
  document.title = `${item.name} — Découvrir les équipements — PocketNet`;

  const article = makeElement("article", "equipment-detail");
  const hero = makeElement("div", "equipment-detail-hero");
  hero.append(makePhoto(details, "equipment-photo-detail"));

  const summary = makeElement("div", "equipment-detail-summary");
  summary.append(
    makeElement("span", `capability-status${item.availability === "simulated" ? " capability-active" : ""}`, item.availability_label),
    makeElement("p", "equipment-detail-lede", item.summary),
    makeElement("h2", "", "À quoi sert-il ?"),
    makeElement("p", "equipment-detail-copy", details.explanation),
  );
  const analogy = makeElement("aside", "equipment-analogy");
  analogy.append(
    makeElement("strong", "", "Pour se le représenter"),
    makeElement("p", "", details.analogy),
  );
  summary.append(analogy);
  hero.append(summary);
  article.append(hero);

  const columns = makeElement("div", "equipment-detail-columns");
  const takeaways = makeElement("section", "equipment-detail-section");
  takeaways.append(makeElement("h2", "", "À retenir"));
  const list = makeElement("ul", "equipment-takeaways");
  details.takeaways.forEach((takeaway) => list.append(makeElement("li", "", takeaway)));
  takeaways.append(list);

  const simulator = makeElement("section", "equipment-detail-section equipment-simulator");
  simulator.append(
    makeElement("span", "section-eyebrow", "DANS POCKETNET"),
    makeElement("h2", "", item.availability_label),
    makeElement("p", "", item.simulator_details || item.role),
  );
  columns.append(takeaways, simulator);
  article.append(columns);

  const actions = makeElement("div", "equipment-detail-actions");
  actions.append(makeLink("/equipements/", "← Retour au catalogue", "button button-secondary"));
  if (item.course) {
    actions.append(makeLink(`/apprendre/cours/${encodeURIComponent(item.course)}/`, "Voir le cours associé", "button button-primary"));
  }
  if (item.availability === "simulated") {
    actions.append(makeLink("/#laboratoires", "Essayer dans un laboratoire", "button button-primary"));
  }
  article.append(actions);
  content.replaceChildren(article);
  status.textContent = `Fiche découverte : ${item.name}.`;
}

async function loadEquipment() {
  status.textContent = "Chargement des fiches d’équipements…";
  try {
    const response = await fetch("/api/learning/catalog/", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Le serveur a répondu avec le statut ${response.status}.`);
    const catalog = await response.json();
    const equipment = catalog.equipment;
    if (!Array.isArray(equipment)) throw new Error("Le catalogue ne contient pas de liste d’équipements valide.");

    const slug = shell.dataset.equipmentSlug;
    if (slug) {
      const item = equipment.find((candidate) => candidate.slug === slug);
      if (!item) throw new Error("Cette fiche n’est pas disponible dans le catalogue public.");
      renderDetail(item);
    } else {
      renderCatalog(equipment);
    }
    status.classList.remove("learning-error");
  } catch (error) {
    status.classList.add("learning-error");
    status.textContent = `Impossible de charger les fiches d’équipements : ${error.message}`;
    const retry = makeElement("button", "button button-secondary", "Réessayer");
    retry.type = "button";
    retry.addEventListener("click", loadEquipment);
    content.replaceChildren(retry);
  }
}

if (shell && status && content && title) {
  initializePwa();
  loadEquipment();
}
