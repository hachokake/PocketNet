const page = document.querySelector("#learning-page");
const status = document.querySelector("#learning-status");
const searchInput = document.querySelector("#learning-search");
const categoryFilter = document.querySelector("#learning-category-filter");
const levelFilter = document.querySelector("#learning-level-filter");
const filterForm = document.querySelector("#learning-filters");
const LEVEL_LABELS = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

let catalog;
let loading = false;

const LEARNING_PROGRESS_KEY = "pocketnet.learning-progress.v1";

function readLearningProgress() {
  try {
    const stored = window.localStorage.getItem(LEARNING_PROGRESS_KEY);
    if (!stored) return { courses: {} };
    const parsed = JSON.parse(stored);
    return parsed && parsed.courses && typeof parsed.courses === "object"
      ? parsed
      : { courses: {} };
  } catch (error) {
    return { courses: {} };
  }
}

function writeLearningProgress(progress) {
  try {
    window.localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(progress));
  } catch (error) {
    status.textContent = "La progression ne peut pas être enregistrée sur cet appareil.";
  }
}

function rememberCourseVisit(slug) {
  const progress = readLearningProgress();
  progress.courses = progress.courses || {};
  progress.courses[slug] = {
    ...(progress.courses[slug] || {}),
    lastVisitedAt: new Date().toISOString(),
  };
  writeLearningProgress(progress);
}

function markChapterRead(slug, chapterIndex) {
  const progress = readLearningProgress();
  progress.courses = progress.courses || {};
  const course = progress.courses[slug] || {};
  const readChapters = Array.isArray(course.readChapters) ? course.readChapters : [];
  if (!readChapters.includes(chapterIndex)) readChapters.push(chapterIndex);
  progress.courses[slug] = {
    ...course,
    readChapters,
    lastChapterIndex: chapterIndex,
    lastVisitedAt: new Date().toISOString(),
  };
  writeLearningProgress(progress);
}

function getCourseProgress(slug) {
  const course = readLearningProgress().courses?.[slug];
  return {
    readChapters: Array.isArray(course?.readChapters) ? course.readChapters : [],
    lastChapterIndex: Number.isInteger(course?.lastChapterIndex) ? course.lastChapterIndex : null,
  };
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendList(parent, items, className) {
  if (!items.length) return;
  const list = makeElement("ul", className);
  items.forEach((text) => list.append(makeElement("li", "", text)));
  parent.append(list);
}

function currentRoute() {
  const hash = window.location.hash || "#apprendre";
  if (hash !== "#apprendre" && hash !== "#apprendre/") {
    const match = /^#apprendre\/(categorie|cours|parcours|vue-ensemble|exercices|travaux-pratiques|documentation|glossaire)(?:\/([a-z0-9-]+))?(?:\/(?:chapitre|module|lecon)\/([a-z0-9-]+))?/i.exec(hash);
    if (match) {
      return { type: match[1].toLowerCase(), slug: match[2] || null, position: match[3] || null };
    }
  }
  if (hash === "#apprendre" && window.location.pathname.startsWith("/apprendre/")) {
    const segments = window.location.pathname
      .replace(/^\/apprendre\/?/, "")
      .replace(/\/$/, "")
      .split("/")
      .filter(Boolean);
    if (!segments.length) return { type: "vue-ensemble" };
    const allowed = ["categorie", "cours", "parcours", "vue-ensemble", "exercices", "travaux-pratiques", "documentation", "glossaire"];
    if (allowed.includes(segments[0])) {
      return { type: segments[0], slug: segments[1] || null };
    }
  }
  const match = /^#apprendre\/(categorie|cours|parcours|vue-ensemble|exercices|travaux-pratiques|documentation|glossaire)(?:\/([a-z0-9-]+))?$/i.exec(hash);
  if (match) {
    return { type: match[1].toLowerCase(), slug: match[2] || null };
  }
  if (hash === "#apprendre" || hash === "#apprendre/") return { type: "vue-ensemble" };
  return { type: "catalog" };
}

function scrollToLearningPage() {
  page.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCourseCard(course) {
  const card = makeElement("article", "learning-course-card");
  const meta = makeElement("div", "learning-card-meta");
  meta.append(
    makeElement("span", "learning-level", LEVEL_LABELS[course.level] || course.level),
    makeElement("span", "", course.category.title),
  );
  card.append(meta, makeElement("h4", "", course.title));
  card.append(makeElement("p", "", course.description));
  const details = makeElement("p", "learning-course-details");
  details.textContent = [
    `${course.chapter_count} ${course.chapter_count === 1 ? "chapitre" : "chapitres"}`,
    `${course.exercise_count} ${course.exercise_count === 1 ? "exercice" : "exercices"}`,
    course.estimated_minutes ? `${course.estimated_minutes} min` : "",
  ].filter(Boolean).join(" · ");
  card.append(details);
  const link = makeElement("a", "public-text-link", "Consulter le cours →");
  link.href = `#apprendre/cours/${encodeURIComponent(course.slug)}`;
  card.append(link);
  return card;
}

function renderCategories(categories) {
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", "Catégories"));
  const grid = makeElement("div", "learning-category-grid");
  categories.forEach((category) => {
    const card = makeElement("article", "learning-category-card");
    card.append(
      makeElement("span", "learning-category-number", category.icon),
      makeElement("h4", "", category.title),
      makeElement("p", "", category.description),
    );
    const count = makeElement("span", "learning-category-count");
    count.textContent = `${category.course_count} ${category.course_count === 1 ? "cours publié" : "cours publiés"}`;
    const link = makeElement("a", "public-text-link", "Explorer →");
    link.href = `#apprendre/parcours/${encodeURIComponent(category.slug)}`;
    card.append(count, link);
    grid.append(card);
  });
  section.append(grid);
  return section;
}

function renderCourses(courses, heading = "Cours disponibles") {
  const section = makeElement("section", "learning-results-section");
  const header = makeElement("div", "learning-results-heading");
  header.append(
    makeElement("h3", "", heading),
    makeElement("span", "learning-result-count", String(courses.length)),
  );
  section.append(header);
  if (!courses.length) {
    section.append(makeElement("p", "learning-empty-state", "Aucun cours publié ne correspond à ces filtres."));
    return section;
  }
  const grid = makeElement("div", "learning-course-grid");
  courses.forEach((course) => grid.append(renderCourseCard(course)));
  section.append(grid);
  return section;
}

function renderReferences(items, type) {
  if (!items.length) return null;
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", type === "equipment" ? "Fiches équipements" : "Références protocoles"));
  const grid = makeElement("div", "learning-reference-grid");
  items.forEach((item) => {
    const card = makeElement("article", "learning-reference-card");
    card.append(makeElement("h4", "", item.name));
    card.append(makeElement("p", "", item.summary));
    card.append(makeElement("span", "capability-status", item.availability_label));
    if (item.course) {
      const link = makeElement("a", "public-text-link", "Cours associé →");
      link.href = `#apprendre/cours/${encodeURIComponent(item.course)}`;
      card.append(link);
    }
    grid.append(card);
  });
  section.append(grid);
  return section;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const text = [
    item.title,
    item.name,
    item.description,
    item.summary,
    item.role,
    item.category?.title,
    ...(item.keywords || []),
    ...(item.characteristics || []),
  ].filter(Boolean).join(" ").toLocaleLowerCase("fr");
  return text.includes(query);
}

function renderBreadcrumb(items) {
  const breadcrumb = makeElement("nav", "learning-breadcrumb");
  breadcrumb.setAttribute("aria-label", "Fil d’Ariane");
  items.forEach((item, index) => {
    if (index > 0) breadcrumb.append(makeElement("span", "learning-breadcrumb-separator", "›"));
    if (item.href) {
      const link = makeElement("a", "", item.label);
      link.href = item.href;
      breadcrumb.append(link);
    } else {
      breadcrumb.append(makeElement("span", "", item.label));
    }
  });
  return breadcrumb;
}

function updateLearningSubnav(route) {
  document.querySelectorAll("[data-learning-route]").forEach((link) => {
    const active = link.dataset.learningRoute === route.type
      || (route.type === "categorie" && link.dataset.learningRoute === "parcours")
      || (route.type === "cours" && link.dataset.learningRoute === "parcours");
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function renderOverview() {
  page.replaceChildren();
  page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Vue d’ensemble" }]));
  const intro = makeElement("header", "learning-category-intro");
  intro.append(
    makeElement("span", "section-eyebrow", "ESPACE APPRENDRE"),
    makeElement("h3", "", "Votre point de départ"),
    makeElement("p", "", "Retrouvez les ressources publiées, les exercices associés aux cours et les actions disponibles dans le simulateur."),
  );
  page.append(intro);

  const progress = readLearningProgress();
  const visited = Object.entries(progress.courses || {})
    .filter(([, value]) => value && typeof value === "object")
    .sort((a, b) => String(b[1].lastVisitedAt || "").localeCompare(String(a[1].lastVisitedAt || "")));
  if (visited.length) {
    const resumeSection = makeElement("section", "learning-resume-section");
    resumeSection.append(makeElement("h3", "", "Reprendre votre apprentissage"));
    const resumeGrid = makeElement("div", "learning-course-grid");
    visited.slice(0, 3).forEach(([slug, value]) => {
      const course = catalog.courses.find((item) => item.slug === slug);
      if (!course) return;
      const courseProgress = getCourseProgress(slug);
      const card = makeElement("article", "learning-course-card");
      card.append(makeElement("h4", "", course.title));
      card.append(makeElement("p", "", `${courseProgress.readChapters.length} chapitre${courseProgress.readChapters.length === 1 ? "" : "s"} consulté${courseProgress.readChapters.length === 1 ? "" : "s"} sur ${course.chapter_count}.`));
      const link = makeElement("a", "public-text-link", "Reprendre →");
      const targetChapter = Number.isInteger(value.lastChapterIndex)
        ? value.lastChapterIndex + 1
        : 1;
      link.href = `#apprendre/cours/${encodeURIComponent(course.slug)}/chapitre/${targetChapter}/lecon/1`;
      card.append(link);
      resumeGrid.append(card);
    });
    if (resumeGrid.children.length) {
      resumeSection.append(resumeGrid);
      page.append(resumeSection);
    }
  }

  const actions = makeElement("div", "learning-overview-actions");
  [
    ["Parcourir les formations", "#apprendre/parcours", "Accéder aux catégories et cours publiés"],
    ["Faire un exercice", "#apprendre/exercices", "Revoir les questions liées aux cours"],
    ["Pratiquer", "#apprendre/travaux-pratiques", "Accéder aux fonctions réellement simulées"],
  ].forEach(([label, href, description]) => {
    const card = makeElement("article", "learning-overview-card");
    card.append(makeElement("h4", "", label), makeElement("p", "", description));
    const link = makeElement("a", "public-text-link", "Continuer →");
    link.href = href;
    card.append(link);
    actions.append(card);
  });
  page.append(actions);
  page.append(renderCourses(catalog.courses, "Cours publiés"));
  status.textContent = `${catalog.courses.length} cours publiés sont disponibles.`;
  scrollToLearningPage();
}

function renderParcours(slug) {
  page.replaceChildren();
  if (slug) {
    const category = catalog.categories.find((item) => item.slug === slug);
    if (!category) {
      page.append(makeElement("p", "learning-empty-state", "Ce parcours n’est pas disponible."));
      status.textContent = "Parcours introuvable.";
      return;
    }
    page.append(renderBreadcrumb([
      { label: "Apprendre", href: "#apprendre/vue-ensemble" },
      { label: "Parcours", href: "#apprendre/parcours" },
      { label: category.title },
    ]));
    const intro = makeElement("header", "learning-category-intro");
    intro.append(makeElement("span", "section-eyebrow", "PARCOURS"), makeElement("h3", "", category.title), makeElement("p", "", category.description));
    page.append(intro);
    page.append(renderCourses(catalog.courses.filter((course) => course.category.slug === category.slug), "Cours de ce parcours"));
    status.textContent = `${category.course_count} cours publiés dans ce parcours.`;
  } else {
    page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Parcours" }]));
    page.append(renderCategories(catalog.categories));
    status.textContent = `${catalog.categories.length} catégories forment les parcours disponibles actuellement.`;
  }
  scrollToLearningPage();
}

function renderExercises() {
  page.replaceChildren();
  page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Exercices et évaluations" }]));
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", "Exercices associés aux cours"));
  const grid = makeElement("div", "learning-course-grid");
  catalog.courses.filter((course) => course.exercise_count > 0).forEach((course) => {
    const card = makeElement("article", "learning-course-card");
    card.append(makeElement("h4", "", course.title));
    card.append(makeElement("p", "", `${course.exercise_count} ${course.exercise_count === 1 ? "exercice publié" : "exercices publiés"} · Quiz disponible dans le cours.`));
    const link = makeElement("a", "public-text-link", "Ouvrir les exercices →");
    link.href = `#apprendre/cours/${encodeURIComponent(course.slug)}`;
    card.append(link);
    grid.append(card);
  });
  if (!grid.children.length) grid.append(makeElement("p", "learning-empty-state", "Aucun exercice publié n’est actuellement disponible."));
  section.append(grid);
  page.append(section);
  status.textContent = "Les exercices disponibles sont ceux publiés dans les cours.";
  scrollToLearningPage();
}

function renderPracticalWork() {
  page.replaceChildren();
  page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Travaux pratiques" }]));
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", "Activités pratiques disponibles"));
  const grid = makeElement("div", "learning-course-grid");
  [
    ["Laboratoire personnel", "Créer ou ouvrir une topologie enregistrée sur cet appareil.", "#laboratoires"],
    ["Commutation VLAN", "Configurer les VLAN d’accès et les trunks 802.1Q dans une topologie.", "#apprendre/cours/vlan-access-trunk"],
    ["Adressage IPv4", "Consulter les bases, puis configurer les hôtes dans le laboratoire.", "#apprendre/cours/ipv4-sous-reseau-26"],
    ["Routage IPv4", "Tester le transit avec les routes statiques prises en charge par le moteur.", "#apprendre/cours/routage-ipv4-statique"],
  ].forEach(([title, description, href]) => {
    const card = makeElement("article", "learning-course-card");
    card.append(makeElement("h4", "", title), makeElement("p", "", description));
    const link = makeElement("a", "public-text-link", "Ouvrir →");
    link.href = href;
    card.append(link);
    grid.append(card);
  });
  section.append(grid);
  page.append(section);
  status.textContent = "Les liens indiqués utilisent uniquement des fonctions disponibles.";
  scrollToLearningPage();
}

function renderDocumentation() {
  page.replaceChildren();
  page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Documentation technique" }]));
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", "Références techniques publiées"));
  const protocolGrid = makeElement("div", "learning-reference-grid");
  catalog.protocols.forEach((item) => {
    const card = makeElement("article", "learning-reference-card");
    card.append(makeElement("h4", "", item.name), makeElement("p", "", item.summary), makeElement("span", "capability-status", item.availability_label));
    if (item.course) {
      const link = makeElement("a", "public-text-link", "Cours associé →");
      link.href = `#apprendre/cours/${encodeURIComponent(item.course)}`;
      card.append(link);
    }
    protocolGrid.append(card);
  });
  section.append(protocolGrid);
  page.append(section);
  status.textContent = `${catalog.protocols.length} références protocoles sont publiées.`;
  scrollToLearningPage();
}

function renderGlossary() {
  page.replaceChildren();
  page.append(renderBreadcrumb([{ label: "Apprendre", href: "#apprendre/vue-ensemble" }, { label: "Glossaire réseau" }]));
  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const terms = [
    ...catalog.protocols.map((item) => ({ name: item.name, summary: item.summary, category: "Protocole" })),
    ...catalog.equipment.map((item) => ({ name: item.name, summary: item.summary, category: "Équipement" })),
  ].filter((item) => !query || `${item.name} ${item.summary} ${item.category}`.toLocaleLowerCase("fr").includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const section = makeElement("section", "learning-results-section");
  section.append(makeElement("h3", "", "Glossaire alphabétique"));
  const grid = makeElement("div", "learning-reference-grid");
  if (!terms.length) grid.append(makeElement("p", "learning-empty-state", "Aucun terme ne correspond à cette recherche."));
  terms.forEach((term) => {
    const card = makeElement("article", "learning-reference-card");
    card.append(makeElement("span", "learning-category-count", term.category), makeElement("h4", "", term.name), makeElement("p", "", term.summary));
    grid.append(card);
  });
  section.append(grid);
  page.append(section);
  status.textContent = `${terms.length} termes techniques publiés dans le glossaire.`;
  scrollToLearningPage();
}

function renderCatalog() {
  const route = currentRoute();
  updateLearningSubnav(route);
  if (route.type === "vue-ensemble") {
    renderOverview();
    return;
  }
  if (route.type === "parcours") {
    renderParcours(route.slug);
    return;
  }
  if (route.type === "exercices") {
    renderExercises();
    return;
  }
  if (route.type === "travaux-pratiques") {
    renderPracticalWork();
    return;
  }
  if (route.type === "documentation") {
    renderDocumentation();
    return;
  }
  if (route.type === "glossaire") {
    renderGlossary();
    return;
  }
  if (route.type === "cours") {
    renderCourse(route.slug);
    return;
  }

  const query = searchInput.value.trim().toLocaleLowerCase("fr");
  const selectedCategory = categoryFilter.value;
  const selectedLevel = levelFilter.value;
  const matchingCategories = catalog.categories.filter((category) =>
    (!selectedCategory || category.slug === selectedCategory)
    && (!query || matchesSearch(category, query)));
  const matchingCourses = catalog.courses.filter((course) =>
    (!selectedCategory || course.category.slug === selectedCategory)
    && (!selectedLevel || course.level === selectedLevel)
    && matchesSearch(course, query));
  const matchingEquipment = catalog.equipment.filter((item) => matchesSearch(item, query));
  const matchingProtocols = catalog.protocols.filter((item) => matchesSearch(item, query));

  page.replaceChildren();
  const category = route.type === "categorie"
    ? catalog.categories.find((item) => item.slug === route.slug)
    : null;
  if (route.type === "categorie" && !category) {
    page.append(makeElement("p", "learning-empty-state", "Cette catégorie n’est pas disponible."));
    return;
  }
  if (category) {
    const intro = makeElement("header", "learning-category-intro");
    const back = makeElement("a", "learning-back-link", "← Toutes les catégories");
    back.href = "#apprendre";
    intro.append(back, makeElement("span", "section-eyebrow", "CATÉGORIE"));
    intro.append(makeElement("h3", "", category.title), makeElement("p", "", category.description));
    intro.append(makeElement(
      "p",
      "learning-category-count",
      `${category.course_count} ${category.course_count === 1 ? "cours publié" : "cours publiés"}`,
    ));
    page.append(intro);
    page.append(renderCourses(
      matchingCourses.filter((course) => course.category.slug === category.slug),
      "Cours de cette catégorie",
    ));
    status.textContent = "Les cours non publiés ne sont pas affichés.";
    scrollToLearningPage();
    return;
  }

  if (matchingCategories.length) page.append(renderCategories(matchingCategories));
  page.append(renderCourses(matchingCourses));
  const equipmentSection = renderReferences(matchingEquipment, "equipment");
  const protocolSection = renderReferences(matchingProtocols, "protocol");
  if (equipmentSection) page.append(equipmentSection);
  if (protocolSection) page.append(protocolSection);
  const total = catalog.courses.length;
  status.textContent = query || selectedCategory || selectedLevel
    ? `${matchingCourses.length} cours correspondent aux filtres.`
    : `${total} cours publiés dans ${catalog.categories.length} catégories.`;
}

function renderCourse(slug) {
  const course = catalog.courses.find((item) => item.slug === slug);
  if (!course) {
    page.replaceChildren(makeElement("p", "learning-empty-state", "Ce cours n’est pas disponible ou n’est pas publié."));
    status.textContent = "Cours introuvable.";
    return;
  }

  status.textContent = `Cours : ${course.title}.`;
  fetch(`/api/learning/courses/${encodeURIComponent(slug)}/`, {
    headers: { Accept: "application/json" },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Le serveur a répondu avec le statut ${response.status}.`);
      return response.json();
    })
    .then((detail) => {
      if (currentRoute().type !== "cours" || currentRoute().slug !== slug) return;
      rememberCourseVisit(slug);
      page.replaceChildren();
      page.append(renderBreadcrumb([
        { label: "Apprendre", href: "#apprendre/vue-ensemble" },
        { label: "Parcours", href: "#apprendre/parcours" },
        { label: detail.category.title, href: `#apprendre/parcours/${encodeURIComponent(detail.category.slug)}` },
        { label: `Module : ${detail.title}` },
      ]));
      const back = makeElement("a", "learning-back-link", `← Retour au parcours`);
      back.href = `#apprendre/parcours/${encodeURIComponent(detail.category.slug)}`;
      page.append(back);

      const header = makeElement("header", "learning-course-header");
      const meta = makeElement("div", "learning-card-meta");
      meta.append(
        makeElement("span", "learning-level", LEVEL_LABELS[detail.level] || detail.level),
        makeElement("span", "", detail.category.title),
      );
      header.append(meta, makeElement("h3", "", detail.title), makeElement("p", "", detail.description));
      if (detail.estimated_minutes) header.append(makeElement("p", "learning-course-details", `${detail.estimated_minutes} minutes estimées`));
      page.append(header);

      const courseProgress = getCourseProgress(slug);
      const progressPanel = makeElement("section", "learning-progress-panel");
      progressPanel.append(
        makeElement("strong", "", "Progression locale"),
        makeElement("p", "", `${courseProgress.readChapters.length} / ${detail.chapters.length} chapitres consultés sur cet appareil.`),
      );
      page.append(progressPanel);

      const courseIndex = catalog.courses.findIndex((item) => item.slug === detail.slug);
      const courseNavigation = makeElement("nav", "learning-course-navigation");
      courseNavigation.setAttribute("aria-label", "Navigation entre les cours");
      if (courseIndex > 0) {
        const previous = catalog.courses[courseIndex - 1];
        const previousLink = makeElement("a", "learning-course-nav-link", `← ${previous.title}`);
        previousLink.href = `#apprendre/cours/${encodeURIComponent(previous.slug)}`;
        courseNavigation.append(previousLink);
      }
      if (courseIndex >= 0 && courseIndex < catalog.courses.length - 1) {
        const next = catalog.courses[courseIndex + 1];
        const nextLink = makeElement("a", "learning-course-nav-link", `${next.title} →`);
        nextLink.href = `#apprendre/cours/${encodeURIComponent(next.slug)}`;
        courseNavigation.append(nextLink);
      }
      if (courseNavigation.children.length) page.append(courseNavigation);

      if (detail.introduction) {
        const intro = makeElement("section", "learning-detail-section");
        intro.append(makeElement("h4", "", "Introduction"), makeElement("p", "", detail.introduction));
        page.append(intro);
      }
      appendDetailList(page, "Objectifs pédagogiques", detail.objectives);
      appendDetailList(page, "Prérequis", detail.prerequisites);

      const chapterNav = makeElement("nav", "learning-table-of-contents");
      chapterNav.setAttribute("aria-label", "Sommaire du cours");
      chapterNav.append(makeElement("strong", "", "Dans ce cours"));
      const chapterLinks = makeElement("ol");
      detail.chapters.forEach((chapter, index) => {
        const item = makeElement("li");
        const link = makeElement("a", "", chapter.title);
        link.href = `#learning-chapter-${index + 1}`;
        link.addEventListener("click", (event) => {
          event.preventDefault();
          document.querySelector(`#learning-chapter-${index + 1}`)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        item.append(link);
        chapterLinks.append(item);
      });
      chapterNav.append(chapterLinks);
      if (detail.chapters.length) page.append(chapterNav);

      detail.chapters.forEach((chapter, index) => {
        const article = makeElement("article", "learning-chapter");
        article.id = `learning-chapter-${index + 1}`;
        article.append(makeElement("span", "learning-chapter-position", `CHAPITRE ${index + 1} / ${detail.chapters.length}`));
        article.append(makeElement("h4", "", chapter.title));
        chapter.content.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
          article.append(makeElement("p", "", paragraph));
        });
        appendList(article, chapter.key_points, "learning-key-points");

        const chapterNavigation = makeElement("nav", "learning-chapter-navigation");
        chapterNavigation.setAttribute("aria-label", "Navigation du chapitre");
        if (index > 0) {
          const previous = makeElement("a", "learning-chapter-nav-link", "← Chapitre précédent");
          previous.href = `#learning-chapter-${index}`;
          previous.addEventListener("click", (event) => {
            event.preventDefault();
            document.querySelector(`#learning-chapter-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          chapterNavigation.append(previous);
        }
        if (index < detail.chapters.length - 1) {
          const next = makeElement("a", "learning-chapter-nav-link", "Chapitre suivant →");
          next.href = `#learning-chapter-${index + 2}`;
          next.addEventListener("click", (event) => {
            event.preventDefault();
            document.querySelector(`#learning-chapter-${index + 2}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          chapterNavigation.append(next);
        }

        const markButton = makeElement("button", "button button-secondary learning-mark-read", "");
        markButton.type = "button";
        markButton.dataset.chapterIndex = String(index);
        const alreadyRead = getCourseProgress(slug).readChapters.includes(index);
        markButton.textContent = alreadyRead ? "Chapitre consulté" : "Marquer comme consulté";
        markButton.disabled = alreadyRead;
        markButton.addEventListener("click", () => {
          markChapterRead(slug, index);
          markButton.textContent = "Chapitre consulté";
          markButton.disabled = true;
          const updated = getCourseProgress(slug);
          progressPanel.querySelector("p").textContent =
            `${updated.readChapters.length} / ${detail.chapters.length} chapitres consultés sur cet appareil.`;
        });
        chapterNavigation.append(markButton);
        article.append(chapterNavigation);
        page.append(article);
      });

      const route = currentRoute();
      if (route.position) {
        const chapterNumber = Number.parseInt(route.position, 10);
        if (chapterNumber >= 1 && chapterNumber <= detail.chapters.length) {
          window.setTimeout(() => {
            document.querySelector(`#learning-chapter-${chapterNumber}`)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
      }

      if (detail.application_context) {
        const application = makeElement("section", "learning-callout");
        application.append(makeElement("h4", "", "Application en entreprise"), makeElement("p", "", detail.application_context));
        page.append(application);
      }
      appendDetailList(page, "Erreurs fréquentes", detail.common_errors);
      if (detail.summary) {
        const summary = makeElement("section", "learning-summary");
        summary.append(makeElement("h4", "", "À retenir"), makeElement("p", "", detail.summary));
        page.append(summary);
      }
      appendReferences(page, detail.further_reading);
      if (detail.exercises.length) page.append(renderQuiz(detail.exercises));
      const practice = makeElement("a", "learning-practice-link", "Ouvrir mes laboratoires →");
      practice.href = "#laboratoires";
      page.append(practice);
      scrollToLearningPage();
    })
    .catch((error) => {
      page.replaceChildren(makeElement("p", "learning-error", `Impossible de charger ce cours : ${error.message}`));
      status.textContent = "Le cours n’a pas pu être chargé.";
    });
}

function appendDetailList(parent, heading, items) {
  if (!items.length) return;
  const section = makeElement("section", "learning-detail-section");
  section.append(makeElement("h4", "", heading));
  appendList(section, items, "learning-key-points");
  parent.append(section);
}

function appendReferences(parent, references) {
  if (!references.length) return;
  const section = makeElement("section", "learning-detail-section");
  section.append(makeElement("h4", "", "Pour aller plus loin"));
  const list = makeElement("ul", "learning-key-points");
  references.forEach((reference) => {
    const item = makeElement("li");
    const link = makeElement("a", "", reference.label);
    link.href = reference.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link);
    list.append(item);
  });
  section.append(list);
  parent.append(section);
}

function renderQuiz(exercises) {
  const section = makeElement("section", "learning-quiz-section");
  section.append(makeElement("h4", "", "Vérifier ses connaissances"));
  section.append(makeElement("p", "", "Choisissez une réponse à chaque question, puis consultez la correction expliquée. Le résultat reste temporaire et n’est pas enregistré."));
  const form = makeElement("form", "learning-quiz");
  form.dataset.quiz = "true";
  exercises.forEach((exercise, index) => {
    const fieldset = makeElement("fieldset", "learning-question");
    fieldset.dataset.answer = exercise.correct_answer;
    const legend = makeElement("legend", "", `${index + 1}. ${exercise.question}`);
    fieldset.append(legend);
    exercise.choices.forEach((choice) => {
      const label = makeElement("label", "learning-answer");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `exercise-${exercise.id}`;
      input.value = choice.value;
      input.required = true;
      label.append(input, makeElement("span", "", choice.label));
      fieldset.append(label);
    });
    fieldset.append(makeElement("p", "learning-answer-feedback", ""));
    fieldset.lastElementChild.hidden = true;
    fieldset.append(makeElement("p", "learning-answer-explanation", exercise.explanation));
    fieldset.lastElementChild.hidden = true;
    form.append(fieldset);
  });
  const actions = makeElement("div", "learning-quiz-actions");
  const submit = makeElement("button", "button button-primary", "Corriger mes réponses");
  submit.type = "submit";
  const reset = makeElement("button", "button button-quiet", "Recommencer");
  reset.type = "reset";
  actions.append(submit, reset);
  form.append(actions);
  const score = makeElement("p", "learning-quiz-score", "");
  score.hidden = true;
  section.append(form, score);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    let correct = 0;
    const questions = [...form.querySelectorAll(".learning-question")];
    questions.forEach((question) => {
      const answer = form.elements[question.querySelector("input").name].value;
      const isCorrect = answer === question.dataset.answer;
      if (isCorrect) correct += 1;
      const feedback = question.querySelector(".learning-answer-feedback");
      feedback.textContent = isCorrect ? "Bonne réponse." : `Réponse attendue : ${question.dataset.answer}.`;
      feedback.classList.toggle("is-correct", isCorrect);
      feedback.classList.toggle("is-incorrect", !isCorrect);
      feedback.hidden = false;
      question.querySelector(".learning-answer-explanation").hidden = false;
    });
    score.textContent = `Résultat : ${correct} / ${questions.length}. Ce résultat n’est pas enregistré.`;
    score.hidden = false;
  });
  form.addEventListener("reset", () => {
    window.setTimeout(() => {
      form.querySelectorAll(".learning-answer-feedback, .learning-answer-explanation").forEach((item) => {
        item.hidden = true;
        item.classList.remove("is-correct", "is-incorrect");
      });
      score.hidden = true;
    });
  });
  return section;
}

function populateFilters() {
  catalog.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.slug;
    option.textContent = `${category.title} (${category.course_count})`;
    categoryFilter.append(option);
  });
}

async function loadCatalog() {
  if (loading) return;
  loading = true;
  status.textContent = "Chargement des ressources publiques…";
  try {
    const response = await fetch("/api/learning/catalog/", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Le serveur a répondu avec le statut ${response.status}.`);
    catalog = await response.json();
    populateFilters();
    status.classList.remove("learning-error");
    renderCatalog();
  } catch (error) {
    status.replaceChildren();
    status.classList.add("learning-error");
    status.textContent = `Impossible de charger le centre d’apprentissage : ${error.message}`;
    const retry = makeElement("button", "button button-secondary", "Réessayer");
    retry.type = "button";
    retry.addEventListener("click", loadCatalog);
    page.replaceChildren(retry);
  } finally {
    loading = false;
  }
}

if (page && status && searchInput && categoryFilter && levelFilter && filterForm) {
  searchInput.addEventListener("input", renderCatalog);
  categoryFilter.addEventListener("change", renderCatalog);
  levelFilter.addEventListener("change", renderCatalog);
  filterForm.addEventListener("reset", () => window.setTimeout(renderCatalog));
  window.addEventListener("hashchange", () => {
    if (!catalog) return;
    renderCatalog();
    if (currentRoute().type !== "catalog") scrollToLearningPage();
  });
  loadCatalog();
}
