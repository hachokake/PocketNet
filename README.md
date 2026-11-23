# PocketNet

PocketNet est un socle de simulateur réseau pédagogique, préparé pour évoluer
vers une application mobile installable et utilisable hors ligne.

## Démarrer l'application

Compilez d'abord le moteur TypeScript, puis lancez Django depuis la racine :

```powershell
cd engine
npm install
npm run build
cd ..
python backend\manage.py runserver
```

Ouvrez ensuite <http://127.0.0.1:8000/>. L'interface et l'API sont servies par
Django ; le moteur compilé est servi comme module ES indépendant.

Pour vérifier le backend :

```powershell
python backend\manage.py test api
```

Le moteur TypeScript est indépendant du backend. Pour le compiler et lancer ses
tests unitaires, placez-vous dans `engine` :

```powershell
cd engine
npm install
npm test
```

## Organisation

- `backend/` : projet Django et endpoints serveur, dont le contrôle de santé.
- `frontend/` : interface responsive, ressources web et base PWA.
- `engine/src/domain/` : équipements, interfaces, connexions, paquets,
  événements et erreurs du domaine réseau.
- `engine/src/topology/` : stockage et validation des équipements et connexions.
- `engine/src/engine/` : cycle de vie de la simulation et journal d'événements.
- `engine/src/protocols/` : modules Ethernet, ARP, IPv4 et ICMP simplifiés.
- `engine/src/lab/` : hôtes simulés et scénario PC1–switch–PC2.
- `engine/tests/` : tests unitaires Node.js du moteur TypeScript.
- `PocketNet logo/` : ressources graphiques originales conservées.

Le laboratoire guidé simule deux PC reliés à un switch Ethernet. Il met en
œuvre l'apprentissage de la table MAC et la diffusion des destinations
inconnues, une résolution ARP locale, l'adressage IPv4 et un échange ICMP Echo
simplifié. Les événements affichés dans la console proviennent du moteur.
Aucun paquet n'est envoyé sur le réseau réel. Le switch prend en charge les
ports administrativement arrêtés, l'apprentissage et l'effacement des entrées
MAC, les VLAN d'accès, ainsi que l'encapsulation/désencapsulation 802.1Q sur
les trunks. Les entrées MAC dynamiques expirent après cinq minutes. Le service
worker met en cache les modules du laboratoire, mais pas les API.

L'écran d'accueil propose des tutoriels de référence et un catalogue
documentaire. Les laboratoires personnels créés depuis l'écran d'accueil sont
enregistrés dans le stockage local du navigateur ; ils ne sont ni synchronisés
ni sauvegardés par Django. Le laboratoire Ethernet fourni est un scénario guidé
distinct de ces espaces personnels.

Chaque laboratoire personnel s'ouvre dans l'éditeur de topologie. Les
équipements, leurs interfaces, leurs positions et les câbles sont enregistrés
dans l'objet du laboratoire en stockage local. Les anciennes fiches sans
topologie restent ouvrables et reçoivent une topologie vide à leur première
modification. Les interfaces reçoivent une adresse MAC locale unicast lors de
leur création ; elle est conservée avec le laboratoire et peut être modifiée
dans les propriétés, sous réserve qu'elle soit valide et unique.

Un double-clic sur un PC ouvre ses vues Desktop, IP Configuration et Terminal.
Un double-clic sur un switch ouvre une console IOS pédagogique avec les modes
utilisateur, privilégié, configuration globale, interface, VLAN et console.
Les commandes principales incluent `enable`, `configure terminal`, `hostname`,
`interface`/`interface range`, `shutdown`/`no shutdown`, `switchport mode`,
`switchport access vlan`, `switchport trunk allowed vlan`, `vlan`, `show vlan
brief`, `show interfaces status`, `show interfaces trunk`, `show mac
address-table`, `clear mac address-table dynamic`, `write memory`,
`show running-config`, `show startup-config` et `reload`. Les commandes
acceptent les abréviations non ambiguës. La configuration running et startup,
la base VLAN et les ports sont conservés dans le laboratoire local.

Les VLAN et trunks modifient effectivement le transfert des trames et peuvent
isoler ou relier des hôtes selon leur configuration. Les ports configurés en
shutdown ne transfèrent pas les trames. Les commandes STP répondent
explicitement que STP n'est pas implémenté ; aucune prévention de boucle STP
n'est simulée. La vitesse/duplex et les fonctionnalités de gestion IPv4 du
switch ne sont pas simulées non plus.

Le terminal asynchrone accepte `hostname`, `ipconfig` (dont `/all`, `/flushdns`,
`/release` et `/renew`), `getmac`, `help`, `cls`, `ver`, `ping` (options `-n`,
`-t` et `-i` pour fixer le TTL initial), `tracert` (option `-d`),
`arp -a`/`arp -d`, `route print`,
`netstat`/`netstat -an` et `nslookup`. Les commandes s'exécutent une à la fois ;
les flèches haut/bas rappellent l'historique et Ctrl+C interrompt une commande
en cours. La sortie et les événements de simulation sont produits
progressivement par le moteur TypeScript.

`ping` et `tracert` utilisent les câbles, switches, ARP, IPv4 et ICMP simulés.
Un ping vers l’adresse IPv4 propre du PC est remis localement à sa pile ICMP :
il réussit si l’adresse est configurée sur son interface active et si ICMP est
autorisé, sans câble ni résolution ARP.
Chaque paquet IPv4 reçoit un TTL initial de 128 par défaut, configurable par
équipement dans la configuration du moteur ou par `ping -i`. Les routeurs
décrémentent le TTL avant le transfert, abandonnent les paquets expirés et
génèrent ICMP Time Exceeded ; les switches ne le modifient pas. Le moteur prend
en charge les routes directement connectées et les routes statiques IPv4
(`staticRoutes`) afin de simuler le transit multi-routeur. L'éditeur visuel ne
propose pas encore de panneau de configuration des routes statiques.

L'application n'invente pas de service DNS, de bail DHCP ni de connexions
TCP/UDP : les commandes correspondantes signalent explicitement ces limites.
Aucun paquet n'est envoyé sur le réseau réel. Le bouton général « Démarrer la
simulation » reste désactivé pour les topologies complètes.

Les tests du modèle de topologie se lancent depuis la racine avec
`node --test frontend/tests/topology-model.test.mjs`.

Avant tout déploiement, définissez `DJANGO_SECRET_KEY` avec une valeur secrète
et `DJANGO_DEBUG=0`.

## Deployment on PythonAnywhere

PocketNet uses Django 6.0.1 and Python 3.13. PythonAnywhere currently provides
Python 3.13 on its `innit` system image; check the system image available to
your account before creating the web app. Django 6.0 requires Python 3.12 or
newer.

The project uses SQLite and does not currently store uploaded media or use
Django authentication/session middleware. User-created laboratories are kept
in the browser's local storage, not in the server database. Keep the SQLite
database file private and back it up if server-side data is added later.

### 1. Clone the repository and create a virtual environment

In a PythonAnywhere Bash console:

```bash
git clone https://github.com/hachokake/PocketNet.git
cd ~/PocketNet
mkvirtualenv --python=/usr/bin/python3.13 pocketnet-venv
pip install -r backend/requirements.txt
```

In the PythonAnywhere **Web** tab, create a **Manual Configuration** web app
with Python 3.13 and select `pocketnet-venv` as its virtual environment.

### 2. Configure environment variables

Create a private `.env` file from the example:

```bash
cp .env.example .env
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Put the generated key in `.env`, then replace `<username>` with your
PythonAnywhere username:

```dotenv
DJANGO_SECRET_KEY=<generated-secret>
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=<username>.pythonanywhere.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://<username>.pythonanywhere.com
DJANGO_DATABASE_PATH=/home/<username>/PocketNet/backend/db.sqlite3
DJANGO_STATIC_ROOT=/home/<username>/PocketNet/backend/staticfiles
DJANGO_SECURE_SSL_REDIRECT=0
DJANGO_SECURE_HSTS_SECONDS=0
```

The `.env` file is ignored by Git. Do not copy a real secret into
`.env.example` or commit `.env`. PythonAnywhere's HTTPS redirect is configured
in its Web tab; enable it after HTTPS is available for the domain. Keep HSTS
disabled until HTTPS has been confirmed.

### 3. Configure the PythonAnywhere WSGI file

Open the WSGI file linked from the PythonAnywhere **Web** tab and use this
configuration, replacing `<username>`:

```python
import os
import sys
from pathlib import Path

project_root = Path("/home/<username>/PocketNet")
backend_dir = project_root / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pocketnet.settings")

from django.core.wsgi import get_wsgi_application

application = get_wsgi_application()
```

Django loads the optional `.env` file from the project root through
`python-dotenv`. The same settings are used by WSGI and management commands.
The checked-in `backend/pocketnet/wsgi.py` also derives the backend path from
its own location; the PythonAnywhere WSGI file must still add the deployment's
backend path to `sys.path`.

### 4. Initialize the database and collect static files

From `~/PocketNet`, with `pocketnet-venv` active:

```bash
python backend/manage.py migrate
python backend/manage.py collectstatic --noinput
python backend/manage.py check --deploy
```

The compiled JavaScript modules in `engine/dist/` are included in Git so the
PythonAnywhere deployment does not need Node.js. When changing the simulation
engine, rebuild them locally from `engine/` with `npm ci` and `npm run build`,
then include the generated files in the next commit.

### 5. Map static files and reload

In the PythonAnywhere **Web** tab, add a static files mapping:

| URL | Directory |
| --- | --- |
| `/static/` | `/home/<username>/PocketNet/backend/staticfiles` |

Save and reload the web app. The manifest, service worker, offline page, icons,
frontend modules and compiled simulation engine are collected under this
mapping. PocketNet's service worker and API responses are not treated as
private user data and the service worker does not cache API responses.

PythonAnywhere deployment is not performed or validated by this repository
setup. SQLite is retained to match the current project; no PostgreSQL migration
or media-upload storage is configured.
