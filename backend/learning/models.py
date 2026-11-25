from django.db import models


LEVEL_CHOICES = [
    ("beginner", "Débutant"),
    ("intermediate", "Intermédiaire"),
    ("advanced", "Avancé"),
]


class LearningCategory(models.Model):
    title = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField()
    icon = models.CharField(max_length=24, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "title"]
        verbose_name = "catégorie d’apprentissage"
        verbose_name_plural = "catégories d’apprentissage"

    def __str__(self):
        return self.title


class Course(models.Model):
    category = models.ForeignKey(
        LearningCategory,
        on_delete=models.PROTECT,
        related_name="courses",
    )
    title = models.CharField(max_length=180)
    slug = models.SlugField(max_length=200, unique=True)
    description = models.TextField()
    level = models.CharField(max_length=16, choices=LEVEL_CHOICES, default="beginner")
    estimated_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    introduction = models.TextField(blank=True)
    objectives = models.JSONField(default=list, blank=True)
    prerequisites = models.JSONField(default=list, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    application_context = models.TextField(blank=True)
    common_errors = models.JSONField(default=list, blank=True)
    summary = models.TextField(blank=True)
    further_reading = models.JSONField(default=list, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category__order", "order", "title"]
        verbose_name = "cours"
        verbose_name_plural = "cours"

    def __str__(self):
        return self.title


class Chapter(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="chapters")
    title = models.CharField(max_length=180)
    content = models.TextField()
    key_points = models.JSONField(default=list, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["course", "order"], name="learning_chapter_order_unique"),
        ]
        verbose_name = "chapitre"
        verbose_name_plural = "chapitres"

    def __str__(self):
        return f"{self.course.title} — {self.title}"


class Exercise(models.Model):
    TYPE_CHOICES = [
        ("single_choice", "Choix unique"),
        ("true_false", "Vrai ou faux"),
    ]

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="exercises")
    title = models.CharField(max_length=180)
    question_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    question = models.TextField()
    choices = models.JSONField(default=list)
    correct_answer = models.CharField(max_length=160)
    explanation = models.TextField()
    level = models.CharField(max_length=16, choices=LEVEL_CHOICES, default="beginner")
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]
        verbose_name = "exercice"
        verbose_name_plural = "exercices"

    def __str__(self):
        return self.title


class Equipment(models.Model):
    AVAILABILITY_CHOICES = [
        ("simulated", "Simulé"),
        ("partial", "Prise en charge partielle"),
        ("reference", "Référence uniquement"),
    ]

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    summary = models.CharField(max_length=240)
    role = models.TextField()
    simulator_availability = models.CharField(max_length=16, choices=AVAILABILITY_CHOICES)
    simulator_details = models.TextField(blank=True)
    characteristics = models.JSONField(default=list, blank=True)
    course = models.ForeignKey(
        Course,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="equipment_references",
    )
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "équipement"
        verbose_name_plural = "équipements"

    def __str__(self):
        return self.name


class Protocol(models.Model):
    AVAILABILITY_CHOICES = [
        ("simulated", "Simulé"),
        ("partial", "Simulation partielle"),
        ("reference", "Référence uniquement"),
    ]

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    summary = models.CharField(max_length=240)
    description = models.TextField()
    layers = models.JSONField(default=list, blank=True)
    port = models.CharField(max_length=32, blank=True)
    simulator_availability = models.CharField(
        max_length=16,
        choices=AVAILABILITY_CHOICES,
        default="reference",
    )
    course = models.ForeignKey(
        Course,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="protocol_references",
    )
    order = models.PositiveSmallIntegerField(default=0)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "protocole"
        verbose_name_plural = "protocoles"

    def __str__(self):
        return self.name
