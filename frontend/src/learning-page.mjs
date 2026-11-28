import { initializePwa } from "./pwa.mjs";

const shell = document.querySelector(".learning-page-shell");
const page = document.querySelector("#learning-page");
const status = document.querySelector("#learning-status");
const title = document.querySelector("#learning-page-title");

const section = shell?.dataset.learningSection || "vue-ensemble";
const courseSlug = shell?.dataset.courseSlug || "";
const progressKey = "pocketnet.learning-progress.v1";
let catalog = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readProgress() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(progressKey) || '{"courses":{}}');
    return parsed?.courses && typeof parsed.courses === "object"
      ? parsed
      : { courses: {} };
  } catch {
    return { courses: {} };
  }
}

function writeProgress(progress) {
  try {
    window.localStorage.setItem(progressKey, JSON.stringify(progress));
  } catch {
    status.textContent = "La progression ne peut pas être enregistrée sur cet appareil.";
  }
}

function rememberVisit(slug) {
  const progress = readProgress();
  progress.courses[slug] = {
    ...(progress.courses[slug] || {}),
    lastVisitedAt: new Date().toISOString(),
  };
  writeProgress(progress);
}

function getCourseProgress(slug) {
  const course = readProgress().courses[slug];
  return Array.isArray(course?.readChapters) ? course.readChapters : [];
}

function markChapter(slug, index) {
  const progress = readProgress();
  const course = progress.courses[slug] || {};
  const read = Array.isArray(course.readChapters) ? course.readChapters : [];
  if (!read.includes(index)) read.push(index);
  progress.courses[slug] = {
    ...course,
    readChapters: read,
    lastChapterIndex: index,
    lastVisitedAt: new Date().toISOString(),
  };
  writeProgress(progress);
}

function breadcrumb(items) {
  const nav = element("nav", "learning-breadcrumb");
  nav.setAttribute("aria-label", "Fil d’Ariane");
  items.forEach((item, index) => {
    if (index) nav.append(element("span", "learning-breadcrumb-separator", "›"));
    if (item.href) {
      const link = element("a", "", item.label);
      link.href = item.href;
      nav.append(link);
    } else {
      nav.append(element("span", "", item.label));
    }
  });
  return nav;
}

function setActiveRoute() {
  const active = section === "parcours-detail" ? "parcours" : section;
  document.querySelectorAll("[data-learning-route]").forEach((link) => {
    const isActive = link.dataset.learningRoute === active
      || (section === "cours" && link.dataset.learningRoute === "parcours");
    link.classList.toggle("is-active", isActive);
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function loadCatalog() {
  const response = await fetch("/api/learning/catalog/", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Le serveur a répondu avec le statut ${response.status}.`);
  catalog = await response.json();
}

function card(titleText, description, href, label = "Ouvrir →") {
  const article = element("article", "learning-course-card");
  article.append(element("h4", "", titleText), element("p", "", description));
  const link = element("a", "public-text-link", label);
  link.href = href;
  article.append(link);
  return article;
}

function courseCard(course) {
  const article = element("article", "learning-course-card");
  article.append(
    element("h4", "", course.title),
    element("p", "", course.description),
  );
  const details = element("p", "learning-course-details");
  details.textContent = `${course.chapter_count} chapitres · ${course.exercise_count} exercices`;
  article.append(details);
  const link = element("a", "public-text-link", "Consulter le cours →");
  link.href = `/apprendre/cours/${encodeURIComponent(course.slug)}/`;
  article.append(link);
  return article;
}

function renderOverview() {
  title.textContent = "Vue d’ensemble";
  page.append(breadcrumb([{ label: "Apprendre" }, { label: "Vue d’ensemble" }]));

  const intro = element("header", "learning-category-intro");
  intro.append(
    element("span", "section-eyebrow", "POINT DE DÉPART"),
    element("h3", "", "Votre apprentissage réseau"),
    element("p", "", "Retrouvez les parcours publiés, les cours disponibles et les activités qui utilisent réellement PocketNet."),
  );
  page.append(intro);

  const progress = readProgress();
  const visited = Object.entries(progress.courses || {})
    .filter(([, value]) => value?.lastVisitedAt)
    .sort((a, b) => String(b[1].lastVisitedAt).localeCompare(String(a[1].lastVisitedAt)));
  if (visited.length) {
    const sectionNode = element("section", "learning-resume-section");
    sectionNode.append(element("h3", "", "Reprendre votre apprentissage"));
    const grid = element("div", "learning-course-grid");
    visited.slice(0, 3).forEach(([slug]) => {
      const course = catalog.courses.find((item) => item.slug === slug);
      if (!course) return;
      const count = getCourseProgress(slug).length;
      grid.append(card(
        course.title,
        `${count} / ${course.chapter_count} chapitres consultés`,
        `/apprendre/cours/${encodeURIComponent(course.slug)}/`,
        "Reprendre →",
      ));
    });
    if (grid.children.length) {
      sectionNode.append(grid);
      page.append(sectionNode);
    }
  }

  const actions = element("div", "learning-overview-actions");
  actions.append(
    card("Parcourir les formations", "Accéder aux catégories et cours publiés.", "/apprendre/parcours/"),
    card("Faire un exercice", "Revoir les questions associées aux cours.", "/apprendre/exercices/"),
    card("Pratiquer", "Ouvrir les fonctions réellement prises en charge.", "/apprendre/travaux-pratiques/"),
  );
  page.append(actions);

  const courses = element("section", "learning-results-section");
  courses.append(element("h3", "", "Cours publiés"));
  const grid = element("div", "learning-course-grid");
  catalog.courses.forEach((course) => grid.append(courseCard(course)));
  courses.append(grid);
  page.append(courses);
  status.textContent = `${catalog.courses.length} cours publiés sont disponibles.`;
}

function renderPaths(slug) {
  if (slug) {
    const category = catalog.categories.find((item) => item.slug === slug);
    if (!category) {
      title.textContent = "Parcours introuvable";
      page.append(element("p", "learning-empty-state", "Ce parcours n’est pas publié ou n’est plus disponible."));
      status.textContent = "Parcours introuvable.";
      return;
    }
    title.textContent = category.title;
    page.append(breadcrumb([
      { label: "Apprendre", href: "/apprendre/" },
      { label: "Parcours", href: "/apprendre/parcours/" },
      { label: category.title },
    ]));
    const intro = element("header", "learning-category-intro");
    intro.append(
      element("span", "section-eyebrow", "PARCOURS"),
      element("h3", "", category.title),
      element("p", "", category.description),
    );
    page.append(intro);
    const grid = element("div", "learning-course-grid");
    const courses = catalog.courses.filter((course) => course.category.slug === category.slug);
    courses.forEach((course) => grid.append(courseCard(course)));
    if (!courses.length) grid.append(element("p", "learning-empty-state", "Aucun cours publié n’est actuellement associé à ce parcours."));
    page.append(grid);
    status.textContent = `${courses.length} cours publiés dans ce parcours.`;
    return;
  }

  title.textContent = "Parcours de formation";
  page.append(breadcrumb([{ label: "Apprendre", href: "/apprendre/" }, { label: "Parcours" }]));
  const grid = element("div", "learning-category-grid");
  catalog.categories.forEach((category) => {
    const article = element("article", "learning-category-card");
    article.append(
      element("span", "learning-category-number", category.icon),
      element("h4", "", category.title),
      element("p", "", category.description),
      element("span", "learning-category-count", `${category.course_count} cours publiés`),
    );
    const link = element("a", "public-text-link", "Explorer →");
    link.href = `/apprendre/parcours/${encodeURIComponent(category.slug)}/`;
    article.append(link);
    grid.append(article);
  });
  page.append(grid);
  status.textContent = `${catalog.categories.length} parcours publiés ou structurés actuellement.`;
}

function renderExercises() {
  title.textContent = "Exercices et évaluations";
  page.append(breadcrumb([{ label: "Apprendre", href: "/apprendre/" }, { label: "Exercices" }]));
  const grid = element("div", "learning-course-grid");
  const courses = catalog.courses.filter((course) => course.exercise_count > 0);
  courses.forEach((course) => grid.append(card(
    course.title,
    `${course.exercise_count} exercices publiés dans ce cours.`,
    `/apprendre/cours/${encodeURIComponent(course.slug)}/`,
  )));
  if (!courses.length) grid.append(element("p", "learning-empty-state", "Aucun exercice publié n’est actuellement disponible."));
  page.append(grid);
  status.textContent = "Les exercices disponibles sont associés aux cours publiés.";
}

function renderPracticalWork() {
  title.textContent = "Travaux pratiques";
  page.append(breadcrumb([{ label: "Apprendre", href: "/apprendre/" }, { label: "Travaux pratiques" }]));
  const grid = element("div", "learning-course-grid");
  [
    ["Laboratoire personnel", "Créer ou ouvrir une topologie enregistrée sur cet appareil.", "/#laboratoires"],
    ["Commutation VLAN", "Configurer les VLAN d’accès et les trunks 802.1Q.", "/apprendre/cours/vlan-access-trunk/"],
    ["Adressage IPv4", "Consulter les bases puis configurer les hôtes dans le laboratoire.", "/apprendre/cours/ipv4-sous-reseau-26/"],
    ["Routage IPv4", "Tester le transit avec les routes statiques prises en charge.", "/apprendre/cours/routage-ipv4-statique/"],
  ].forEach((item) => grid.append(card(...item)));
  page.append(grid);
  status.textContent = "Les liens utilisent uniquement des fonctions disponibles.";
}

function renderDocumentation() {
  title.textContent = "Documentation technique";
  page.append(breadcrumb([{ label: "Apprendre", href: "/apprendre/" }, { label: "Documentation" }]));
  const grid = element("div", "learning-reference-grid");
  catalog.protocols.forEach((protocol) => {
    const article = element("article", "learning-reference-card");
    article.append(
      element("h4", "", protocol.name),
      element("p", "", protocol.summary),
      element("span", "capability-status", protocol.availability_label),
    );
    if (protocol.course) {
      const link = element("a", "public-text-link", "Cours associé →");
      link.href = `/apprendre/cours/${encodeURIComponent(protocol.course)}/`;
      article.append(link);
    }
    grid.append(article);
  });
  page.append(grid);
  status.textContent = `${catalog.protocols.length} références techniques publiées.`;
}

function renderGlossary() {
  title.textContent = "Glossaire réseau";
  page.append(breadcrumb([{ label: "Apprendre", href: "/apprendre/" }, { label: "Glossaire" }]));
  const search = element("input", "learning-glossary-search");
  search.type = "search";
  search.placeholder = "Rechercher un terme technique…";
  search.setAttribute("aria-label", "Rechercher dans le glossaire");
  page.append(search);
  const grid = element("div", "learning-reference-grid");
  page.append(grid);

  const terms = [
    ...catalog.protocols.map((item) => ({ name: item.name, summary: item.summary, category: "Protocole" })),
    ...catalog.equipment.map((item) => ({ name: item.name, summary: item.summary, category: "Équipement" })),
  ].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  function renderTerms(query = "") {
    grid.replaceChildren();
    const normalized = query.trim().toLocaleLowerCase("fr");
    const matches = terms.filter((term) =>
      !normalized || `${term.name} ${term.summary} ${term.category}`.toLocaleLowerCase("fr").includes(normalized));
    matches.forEach((term) => {
      const article = element("article", "learning-reference-card");
      article.append(
        element("span", "learning-category-count", term.category),
        element("h4", "", term.name),
        element("p", "", term.summary),
      );
      grid.append(article);
    });
    status.textContent = `${matches.length} termes techniques affichés.`;
  }
  search.addEventListener("input", () => renderTerms(search.value));
  renderTerms();
}

async function renderCourse() {
  title.textContent = "Cours";
  const response = await fetch(`/api/learning/courses/${encodeURIComponent(courseSlug)}/`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    title.textContent = "Cours introuvable";
    page.append(element("p", "learning-error", "Ce cours n’est pas publié ou n’existe pas."));
    status.textContent = "Cours introuvable.";
    return;
  }
  const detail = await response.json();
  rememberVisit(courseSlug);
  page.append(breadcrumb([
    { label: "Apprendre", href: "/apprendre/" },
    { label: "Parcours", href: "/apprendre/parcours/" },
    { label: detail.category.title, href: `/apprendre/parcours/${encodeURIComponent(detail.category.slug)}/` },
    { label: detail.title },
  ]));

  const header = element("header", "learning-course-header");
  header.append(element("h3", "", detail.title), element("p", "", detail.description));
  page.append(header);

  const progress = element("section", "learning-progress-panel");
  const readCount = getCourseProgress(courseSlug).length;
  progress.append(
    element("strong", "", "Progression locale"),
    element("p", "", `${readCount} / ${detail.chapters.length} chapitres consultés sur cet appareil.`),
  );
  page.append(progress);

  if (detail.introduction) {
    const intro = element("section", "learning-detail-section");
    intro.append(element("h4", "", "Introduction"), element("p", "", detail.introduction));
    page.append(intro);
  }

  const toc = element("nav", "learning-table-of-contents");
  toc.setAttribute("aria-label", "Sommaire du cours");
  toc.append(element("strong", "", "Dans ce cours"));
  const list = element("ol");
  detail.chapters.forEach((chapter, index) => {
    const item = element("li");
    const link = element("a", "", chapter.title);
    link.href = `#learning-chapter-${index + 1}`;
    item.append(link);
    list.append(item);
  });
  toc.append(list);
  page.append(toc);

  detail.chapters.forEach((chapter, index) => {
    const article = element("article", "learning-chapter");
    article.id = `learning-chapter-${index + 1}`;
    article.append(
      element("span", "learning-chapter-position", `CHAPITRE ${index + 1} / ${detail.chapters.length}`),
      element("h4", "", chapter.title),
    );
    chapter.content.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
      article.append(element("p", "", paragraph));
    });
    chapter.key_points.forEach((point) => {
      if (!article.querySelector(".learning-key-points")) {
        article.append(element("ul", "learning-key-points"));
      }
      article.querySelector(".learning-key-points").append(element("li", "", point));
    });

    const navigation = element("nav", "learning-chapter-navigation");
    if (index > 0) {
      const previous = element("a", "learning-chapter-nav-link", "← Chapitre précédent");
      previous.href = `#learning-chapter-${index}`;
      navigation.append(previous);
    }
    if (index < detail.chapters.length - 1) {
      const next = element("a", "learning-chapter-nav-link", "Chapitre suivant →");
      next.href = `#learning-chapter-${index + 2}`;
      navigation.append(next);
    }
    const readButton = element("button", "button button-secondary learning-mark-read");
    readButton.type = "button";
    const alreadyRead = getCourseProgress(courseSlug).includes(index);
    readButton.textContent = alreadyRead ? "Chapitre consulté" : "Marquer comme consulté";
    readButton.disabled = alreadyRead;
    readButton.addEventListener("click", () => {
      markChapter(courseSlug, index);
      readButton.textContent = "Chapitre consulté";
      readButton.disabled = true;
      progress.querySelector("p").textContent =
        `${getCourseProgress(courseSlug).length} / ${detail.chapters.length} chapitres consultés sur cet appareil.`;
    });
    navigation.append(readButton);
    article.append(navigation);
    page.append(article);
  });

  if (detail.exercises.length) {
    const exercises = element("section", "learning-quiz-section");
    exercises.append(element("h4", "", "Vérifier ses connaissances"));
    detail.exercises.forEach((exercise, index) => {
      const fieldset = element("fieldset", "learning-question");
      fieldset.dataset.answer = exercise.correct_answer;
      fieldset.append(element("legend", "", `${index + 1}. ${exercise.question}`));
      exercise.choices.forEach((choice) => {
        const label = element("label", "learning-answer");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `exercise-${exercise.id}`;
        input.value = choice.value;
        label.append(input, element("span", "", choice.label));
        fieldset.append(label);
      });
      const explanation = element("p", "learning-answer-explanation", exercise.explanation);
      explanation.hidden = true;
      fieldset.append(explanation);
      exercises.append(fieldset);
    });
    const submit = element("button", "button button-primary", "Corriger mes réponses");
    submit.type = "button";
    const score = element("p", "learning-quiz-score");
    score.hidden = true;
    submit.addEventListener("click", () => {
      let correct = 0;
      exercises.querySelectorAll(".learning-question").forEach((fieldset) => {
        const selected = fieldset.querySelector("input:checked");
        if (selected?.value === fieldset.dataset.answer) correct += 1;
        const answer = element("p", "learning-answer-feedback");
        answer.textContent = selected?.value === fieldset.dataset.answer
          ? "Bonne réponse."
          : `Réponse attendue : ${fieldset.dataset.answer}.`;
        fieldset.append(answer);
        fieldset.querySelector(".learning-answer-explanation").hidden = false;
      });
      score.textContent = `Résultat : ${correct} / ${detail.exercises.length}. Ce résultat n’est pas enregistré.`;
      score.hidden = false;
    });
    exercises.append(submit, score);
    page.append(exercises);
  }

  const practice = element("a", "learning-practice-link", "Ouvrir mes laboratoires →");
  practice.href = "/#laboratoires";
  page.append(practice);
  title.textContent = detail.title;
  status.textContent = `Cours : ${detail.title}.`;
}

async function init() {
  if (!page || !shell) return;
  initializePwa();
  setActiveRoute();
  try {
    await loadCatalog();
    page.replaceChildren();
    if (section === "vue-ensemble") renderOverview();
    else if (section === "parcours" || section === "parcours-detail") {
      renderPaths(section === "parcours-detail" ? courseSlug : null);
    } else if (section === "exercices") renderExercises();
    else if (section === "travaux-pratiques") renderPracticalWork();
    else if (section === "documentation") renderDocumentation();
    else if (section === "glossaire") renderGlossary();
    else if (section === "cours") await renderCourse();
  } catch (error) {
    page.replaceChildren(element("p", "learning-error", `Impossible de charger les ressources : ${error.message}`));
    status.textContent = "Les ressources n’ont pas pu être chargées.";
  }
}

init();
