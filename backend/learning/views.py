from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET

from .models import Course, Equipment, LearningCategory, Protocol


def _course_summary(course):
    return {
        "title": course.title,
        "slug": course.slug,
        "description": course.description,
        "level": course.level,
        "estimated_minutes": course.estimated_minutes,
        "keywords": course.keywords,
        "category": {
            "title": course.category.title,
            "slug": course.category.slug,
        },
        "chapter_count": len(course.chapters.all()),
        "exercise_count": sum(
            exercise.is_published for exercise in course.exercises.all()
        ),
    }


def _equipment_payload(item):
    return {
        "name": item.name,
        "slug": item.slug,
        "summary": item.summary,
        "role": item.role,
        "availability": item.simulator_availability,
        "availability_label": item.get_simulator_availability_display(),
        "simulator_details": item.simulator_details,
        "characteristics": item.characteristics,
        "course": item.course.slug if item.course and item.course.is_published else None,
    }


@require_GET
def catalog(request):
    categories = LearningCategory.objects.filter(is_published=True).annotate(
        course_count=Count(
            "courses",
            filter=Q(courses__is_published=True),
            distinct=True,
        ),
    )
    courses = Course.objects.filter(
        is_published=True,
        category__is_published=True,
    ).select_related("category").prefetch_related("chapters", "exercises")

    return JsonResponse({
        "categories": [
            {
                "title": category.title,
                "slug": category.slug,
                "description": category.description,
                "icon": category.icon,
                "course_count": category.course_count,
            }
            for category in categories
        ],
        "courses": [_course_summary(course) for course in courses],
        "equipment": [
            _equipment_payload(item)
            for item in Equipment.objects.filter(is_published=True)
            .select_related("course")
        ],
        "protocols": [
            {
                "name": item.name,
                "slug": item.slug,
                "summary": item.summary,
                "description": item.description,
                "layers": item.layers,
                "port": item.port,
                "availability": item.simulator_availability,
                "availability_label": item.get_simulator_availability_display(),
                "course": item.course.slug if item.course and item.course.is_published else None,
            }
            for item in Protocol.objects.filter(is_published=True).select_related("course")
        ],
    })


@require_GET
def course_detail(request, slug):
    course = get_object_or_404(
        Course.objects.filter(
            is_published=True,
            category__is_published=True,
        ).select_related("category").prefetch_related("chapters", "exercises"),
        slug=slug,
    )
    payload = _course_summary(course)
    payload.update({
        "objectives": course.objectives,
        "prerequisites": course.prerequisites,
        "introduction": course.introduction,
        "application_context": course.application_context,
        "common_errors": course.common_errors,
        "summary": course.summary,
        "further_reading": course.further_reading,
        "chapters": [
            {
                "title": chapter.title,
                "content": chapter.content,
                "key_points": chapter.key_points,
            }
            for chapter in course.chapters.all()
        ],
        "exercises": [
            {
                "id": exercise.pk,
                "title": exercise.title,
                "type": exercise.question_type,
                "question": exercise.question,
                "choices": exercise.choices,
                "correct_answer": exercise.correct_answer,
                "explanation": exercise.explanation,
                "level": exercise.level,
            }
            for exercise in course.exercises.filter(is_published=True)
        ],
    })
    return JsonResponse(payload)
