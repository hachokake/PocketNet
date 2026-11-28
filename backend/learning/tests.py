from django.test import TestCase
from django.urls import reverse

from .models import Course, Equipment, LearningCategory


class PublicLearningApiTests(TestCase):
    def test_equipment_catalog_and_published_detail_pages(self):
        catalog_response = self.client.get(reverse("equipment-root"))
        self.assertEqual(catalog_response.status_code, 200)
        self.assertContains(catalog_response, 'data-equipment-slug=""')
        self.assertContains(catalog_response, 'href="/equipements/"')

        equipment = Equipment.objects.get(slug="ordinateur")
        detail_response = self.client.get(
            reverse("equipment-detail", kwargs={"slug": equipment.slug}),
        )
        self.assertEqual(detail_response.status_code, 200)
        self.assertContains(detail_response, 'data-equipment-slug="ordinateur"')
        self.assertContains(detail_response, 'id="equipment-content"')
        self.assertContains(detail_response, 'rel="manifest"')

        self.assertEqual(
            self.client.get(reverse("equipment-detail", kwargs={"slug": "unknown"})).status_code,
            404,
        )
        equipment.is_published = False
        equipment.save(update_fields=["is_published"])
        self.assertEqual(
            self.client.get(
                reverse("equipment-detail", kwargs={"slug": equipment.slug}),
            ).status_code,
            404,
        )

    def test_learning_navigation_routes_are_served_by_the_spa(self):
        for route in [
            reverse("learning-root"),
            reverse("learning-paths"),
            reverse("learning-path-detail", kwargs={"slug": "fondamentaux"}),
            reverse("learning-exercises"),
            reverse("learning-practical-work"),
            reverse("learning-documentation"),
            reverse("learning-glossary"),
            reverse("learning-course", kwargs={"slug": "introduction-reseaux"}),
        ]:
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            self.assertContains(response, "learning-subnav")
            self.assertContains(response, 'rel="manifest"')
            self.assertContains(response, 'id="pwa-install-action"')

        course_response = self.client.get(
            reverse("learning-course", kwargs={"slug": "introduction-reseaux"}),
        )
        self.assertContains(course_response, 'data-course-slug="introduction-reseaux"')

    def test_catalog_is_public_and_counts_only_published_courses(self):
        response = self.client.get(reverse("learning-catalog"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["categories"]), 10)
        self.assertEqual(len(payload["courses"]), 6)
        self.assertEqual(len(payload["equipment"]), 6)
        self.assertEqual(len(payload["protocols"]), 6)

        category = next(item for item in payload["categories"] if item["slug"] == "fondamentaux")
        self.assertEqual(category["course_count"], 2)
        self.assertEqual(
            next(item for item in payload["categories"] if item["slug"] == "securite-reseau")["course_count"],
            0,
        )

        unpublished_category = LearningCategory.objects.get(slug="securite-reseau")
        Course.objects.create(
            category=unpublished_category,
            title="Brouillon privé",
            slug="brouillon-prive",
            description="Ne doit pas apparaître dans le catalogue public.",
            is_published=False,
        )
        response = self.client.get(reverse("learning-catalog"))
        self.assertNotIn("brouillon-prive", {item["slug"] for item in response.json()["courses"]})

    def test_course_page_returns_chapters_and_explanatory_exercises(self):
        response = self.client.get(
            reverse("learning-course-detail", kwargs={"slug": "ipv4-sous-reseau-26"}),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["level"], "beginner")
        self.assertEqual(payload["chapter_count"], 3)
        self.assertEqual(payload["exercise_count"], 2)
        self.assertEqual(len(payload["chapters"]), 3)
        self.assertIn("255.255.255.192", payload["summary"])
        self.assertEqual(payload["exercises"][0]["correct_answer"], "255.255.255.192")
        self.assertTrue(payload["exercises"][0]["explanation"])
        self.assertTrue(payload["further_reading"][0]["url"].startswith("https://www.rfc-editor.org/"))

    def test_unpublished_courses_and_categories_are_not_public(self):
        unpublished_course = Course.objects.get(slug="introduction-reseaux")
        unpublished_course.is_published = False
        unpublished_course.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("learning-course-detail", kwargs={"slug": unpublished_course.slug}),
        )
        self.assertEqual(response.status_code, 404)

        unpublished_course.is_published = True
        unpublished_course.save(update_fields=["is_published"])
        category = unpublished_course.category
        category.is_published = False
        category.save(update_fields=["is_published"])
        response = self.client.get(
            reverse("learning-course-detail", kwargs={"slug": unpublished_course.slug}),
        )
        self.assertEqual(response.status_code, 404)
