const page = document.querySelector("#learning-page");
const status = document.querySelector("#learning-status");
const searchInput = document.querySelector("#learning-search");
const categoryFilter = document.querySelector("#learning-category-filter");
const levelFilter = document.querySelector("#learning-level-filter");
const filterForm = document.querySelector("#learning-filters");
const equipmentGrid = document.querySelector("#learning-equipment-grid");
const LEVEL_LABELS = {
  beginner: "Débutant",
  intermediate: "Intermédiaire",
  advanced: "Avancé",
};

let catalog;
let loading = false;

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
  const match = /^#apprendre\/(categorie|cours)\/([a-z0-9-]+)$/i.exec(window.location.hash);
  return match ? { type: match[1].toLowerCase(), slug: match[2] } : { type: "catalog" };
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
    link.href = `#apprendre/categorie/${encodeURIComponent(category.slug)}`;
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

function renderCatalog() {
  const route = currentRoute();
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
      page.replaceChildren();
      const back = makeElement("a", "learning-back-link", `← ${detail.category.title}`);
      back.href = `#apprendre/categorie/${encodeURIComponent(detail.category.slug)}`;
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
        item.append(link);
        chapterLinks.append(item);
      });
      chapterNav.append(chapterLinks);
      if (detail.chapters.length) page.append(chapterNav);

      detail.chapters.forEach((chapter, index) => {
        const article = makeElement("article", "learning-chapter");
        article.id = `learning-chapter-${index + 1}`;
        article.append(makeElement("h4", "", chapter.title));
        chapter.content.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
          article.append(makeElement("p", "", paragraph));
        });
        appendList(article, chapter.key_points, "learning-key-points");
        page.append(article);
      });

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
  const equipment = catalog.equipment.map((item) => ({
    ...item,
    description: `${item.role} ${item.simulator_details}`,
    keywords: item.characteristics,
  }));
  equipmentGrid.replaceChildren(...equipment.map((item) => {
    const card = makeElement("article", "device-capability");
    card.append(
      makeElement("span", "device-capability-symbol", item.name.slice(0, 3).toUpperCase()),
      makeElement("h3", "", item.name),
      makeElement("p", "", item.simulator_details || item.role),
      makeElement(
        "span",
        `capability-status${item.availability === "simulated" ? " capability-active" : ""}`,
        item.availability_label,
      ),
    );
    if (item.course) {
      const link = makeElement("a", "public-text-link", "Cours associé →");
      link.href = `#apprendre/cours/${encodeURIComponent(item.course)}`;
      card.append(link);
    }
    return card;
  }));
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

if (page && status && searchInput && categoryFilter && levelFilter && filterForm && equipmentGrid) {
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
