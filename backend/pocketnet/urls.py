from django.urls import include, path
from django.views.generic import TemplateView

from api.views import service_worker
from learning.views import equipment_detail


urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("equipements/", TemplateView.as_view(template_name="equipment.html"), name="equipment-root"),
    path("equipements/<slug:slug>/", equipment_detail, name="equipment-detail"),
    path("apprendre/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "vue-ensemble"}), name="learning-root"),
    path("apprendre/parcours/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "parcours"}), name="learning-paths"),
    path("apprendre/parcours/<slug:slug>/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "parcours-detail"}), name="learning-path-detail"),
    path("apprendre/exercices/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "exercices"}), name="learning-exercises"),
    path("apprendre/travaux-pratiques/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "travaux-pratiques"}), name="learning-practical-work"),
    path("apprendre/documentation/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "documentation"}), name="learning-documentation"),
    path("apprendre/glossaire/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "glossaire"}), name="learning-glossary"),
    path("apprendre/cours/<slug:slug>/", TemplateView.as_view(template_name="learning.html", extra_context={"learning_section": "cours"}), name="learning-course"),
    path("api/", include("api.urls")),
    path("api/learning/", include("learning.urls")),
    path("service-worker.js", service_worker, name="service-worker"),
]
