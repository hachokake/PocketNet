from django.urls import include, path
from django.views.generic import TemplateView

from api.views import service_worker


urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("api/", include("api.urls")),
    path("api/learning/", include("learning.urls")),
    path("service-worker.js", service_worker, name="service-worker"),
]
