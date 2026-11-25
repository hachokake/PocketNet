from django.urls import path

from .views import catalog, course_detail


urlpatterns = [
    path("catalog/", catalog, name="learning-catalog"),
    path("courses/<slug:slug>/", course_detail, name="learning-course-detail"),
]
