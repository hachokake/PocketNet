from django.conf import settings
from django.http import FileResponse, JsonResponse


def health(request):
    return JsonResponse({"service": "pocketnet-api", "status": "ok"})


def service_worker(request):
    response = FileResponse(
        (settings.FRONTEND_PUBLIC_DIR / "service-worker.js").open("rb"),
        content_type="application/javascript",
    )
    response["Service-Worker-Allowed"] = "/"
    response["Cache-Control"] = "no-cache"
    response["X-Content-Type-Options"] = "nosniff"
    return response
