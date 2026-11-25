from django.db import migrations


CATEGORIES = [
    ("Fondamentaux des réseaux", "fondamentaux", "Les bases pour comprendre les équipements, les liaisons et les échanges réseau.", "01"),
    ("Adressage IP et subnetting", "adressage-ip", "Lire les adresses IPv4 et IPv6, les préfixes et les sous-réseaux.", "02"),
    ("Équipements réseau", "equipements", "Comprendre le rôle des hôtes, switches, routeurs et équipements associés.", "03"),
    ("Câblage et transmission", "cablage-transmission", "Découvrir les supports, les interfaces et les propriétés de transmission.", "04"),
    ("Commutation et VLAN", "commutation-vlan", "Étudier Ethernet, les tables MAC, les VLAN et les trunks.", "05"),
    ("Routage", "routage", "Comprendre les tables de routage et le transfert entre réseaux IP.", "06"),
    ("Services et protocoles réseau", "protocoles-services", "Explorer les protocoles utilisés par les réseaux et leurs applications.", "07"),
    ("Sécurité réseau", "securite-reseau", "Découvrir les principes défensifs de segmentation et de contrôle d’accès.", "08"),
    ("Administration et supervision", "administration-supervision", "Apprendre les méthodes de configuration, de diagnostic et de documentation.", "09"),
    ("Laboratoires et exercices", "laboratoires-exercices", "Mettre en pratique les notions prises en charge dans PocketNet.", "10"),
]


COURSES = [
    {
        "category": "fondamentaux",
        "title": "Introduction aux réseaux informatiques",
        "slug": "introduction-reseaux",
        "description": "Comprendre ce qui compose un réseau, pourquoi les équipements communiquent et comment lire les premiers schémas.",
        "level": "beginner",
        "estimated_minutes": 20,
        "introduction": "Un réseau informatique relie des systèmes afin qu’ils puissent échanger des données et partager des ressources. Pour comprendre une communication, il faut identifier les hôtes, les liens, les équipements intermédiaires et les règles qui organisent les échanges.",
        "objectives": ["Définir un réseau informatique.", "Distinguer hôte, équipement intermédiaire et lien.", "Comparer les architectures client-serveur et pair-à-pair."],
        "prerequisites": [],
        "keywords": ["LAN", "WAN", "hôte", "client-serveur", "topologie"],
        "application_context": "Dans une entreprise, postes, imprimantes, serveurs et équipements réseau forment une infrastructure dont les frontières et les dépendances doivent être documentées.",
        "common_errors": ["Confondre Internet avec l’ensemble des réseaux informatiques.", "Considérer qu’un câble suffit à garantir une communication sans configuration ni protocole."],
        "summary": "Un réseau est un ensemble de systèmes reliés et capables d’échanger selon des protocoles. Une topologie décrit les connexions ; elle ne prouve pas, à elle seule, que le trafic fonctionne.",
        "further_reading": [{"label": "RFC 1122 — Requirements for Internet Hosts", "url": "https://www.rfc-editor.org/rfc/rfc1122"}],
        "chapters": [
            {
                "title": "Les composants d’un réseau",
                "content": "Un hôte est un système qui émet ou reçoit des données : ordinateur, serveur ou autre terminal. Une interface réseau relie cet hôte à un support. Les switches et les routeurs assurent des fonctions d’interconnexion différentes.\n\nUne liaison peut être filaire ou radio. Les protocoles définissent les formats et les règles d’échange. Une topologie physique décrit les connexions ; une topologie logique décrit les relations de communication.",
                "key_points": ["Identifier les hôtes et leurs interfaces.", "Un lien représenté n’implique pas que le protocole ou la configuration soit opérationnel."],
            },
            {
                "title": "Étendues et architectures",
                "content": "Un PAN couvre un environnement personnel, un LAN une zone locale, un MAN une zone métropolitaine et un WAN une zone étendue. Ces termes décrivent surtout l’échelle et le contexte d’un réseau.\n\nDans une architecture client-serveur, un service fournit une fonction à des clients. En pair-à-pair, les systèmes peuvent partager des ressources sans dépendre d’un serveur central unique. Des systèmes réels combinent souvent les deux approches.",
                "key_points": ["Les catégories PAN, LAN, MAN et WAN ne définissent pas une technologie unique.", "Client-serveur et pair-à-pair décrivent des rôles d’échange, pas des types de câble."],
            },
            {
                "title": "Lire un premier schéma",
                "content": "Repérez les terminaux, les équipements intermédiaires, les interfaces et les liens. Suivez ensuite le chemin possible entre la source et la destination. Pour diagnostiquer une panne, vérifiez séparément le lien, l’adressage, le routage et le service demandé.",
                "key_points": ["Décrire le chemin de bout en bout.", "Une simulation pédagogique ne représente pas nécessairement tous les services d’un équipement réel."],
            },
        ],
        "exercises": [
            {
                "title": "Identifier un équipement intermédiaire",
                "question_type": "single_choice",
                "question": "Quel équipement a principalement pour rôle de transférer des trames entre les ports d’un réseau local ?",
                "choices": [{"value": "switch", "label": "Un switch"}, {"value": "dns", "label": "Un serveur DNS"}, {"value": "cable", "label": "Un câble Ethernet"}],
                "correct_answer": "switch",
                "explanation": "Un switch Ethernet apprend les adresses MAC et transfère les trames entre ses ports selon sa table de commutation.",
            },
        ],
    },
    {
        "category": "fondamentaux",
        "title": "Comprendre le modèle OSI",
        "slug": "modele-osi",
        "description": "Utiliser les sept couches OSI comme grille de lecture pour décrire les fonctions d’une communication.",
        "level": "beginner",
        "estimated_minutes": 25,
        "introduction": "Le modèle OSI est un modèle de référence en sept couches. Il aide à séparer les responsabilités et à raisonner sur les échanges ; il ne signifie pas que chaque protocole réel correspond parfaitement à une seule couche.",
        "objectives": ["Nommer les sept couches OSI.", "Associer quelques fonctions et protocoles aux couches concernées.", "Utiliser le modèle pour structurer un diagnostic."],
        "prerequisites": ["Avoir identifié les rôles d’un hôte et d’un équipement intermédiaire."],
        "keywords": ["OSI", "encapsulation", "Ethernet", "IP", "TCP", "diagnostic"],
        "application_context": "Une équipe d’exploitation peut isoler une panne en vérifiant d’abord le lien et Ethernet, puis l’adressage IP, le transport et enfin l’application.",
        "common_errors": ["Présenter le modèle OSI comme une implémentation logicielle universelle.", "Attribuer chaque protocole complexe à une couche unique sans nuance."],
        "summary": "Les couches OSI vont du support physique (1) aux services applicatifs (7). C’est une grille pédagogique utile, tandis que les piles réelles, notamment TCP/IP, regroupent certaines fonctions différemment.",
        "further_reading": [{"label": "RFC 1122 — Host Requirements", "url": "https://www.rfc-editor.org/rfc/rfc1122"}],
        "chapters": [
            {
                "title": "Les couches 1 à 4",
                "content": "1 — Physique : signaux, supports et transmission des bits. 2 — Liaison de données : trames et accès au lien local, par exemple Ethernet. 3 — Réseau : adressage logique et acheminement, par exemple IPv4. 4 — Transport : communication de bout en bout, fiabilité et multiplexage, par exemple TCP ou UDP.\n\nCes fonctions coopèrent ; une erreur de liaison peut empêcher les couches supérieures de communiquer.",
                "key_points": ["Ethernet est associé principalement à la couche liaison.", "IP assure l’adressage et le routage au niveau réseau.", "TCP et UDP sont des protocoles de transport."],
            },
            {
                "title": "Les couches 5 à 7",
                "content": "5 — Session : organisation du dialogue entre applications. 6 — Présentation : représentation et transformation des données. 7 — Application : services et protocoles directement utilisés par les applications, tels que HTTP ou DNS.\n\nDans les réseaux TCP/IP, ces responsabilités ne sont pas toujours matérialisées en couches indépendantes. Le modèle OSI sert surtout à nommer des fonctions et à communiquer sur un problème.",
                "key_points": ["Le modèle est une référence, pas une obligation d’architecture.", "Un protocole applicatif s’appuie sur plusieurs couches sous-jacentes."],
            },
        ],
        "exercises": [
            {
                "title": "Associer IP à une couche",
                "question_type": "single_choice",
                "question": "À quelle couche OSI associe-t-on principalement le protocole IPv4 ?",
                "choices": [{"value": "2", "label": "Couche 2 — liaison"}, {"value": "3", "label": "Couche 3 — réseau"}, {"value": "4", "label": "Couche 4 — transport"}],
                "correct_answer": "3",
                "explanation": "IPv4 fournit l’adressage logique et l’acheminement des paquets, fonctions associées à la couche réseau (couche 3).",
            },
        ],
    },
    {
        "category": "adressage-ip",
        "title": "Calculer un sous-réseau IPv4 en /26",
        "slug": "ipv4-sous-reseau-26",
        "description": "Déduire masque, adresse réseau, broadcast, plage d’hôtes et sous-réseau suivant à partir de 192.168.1.0/26.",
        "level": "beginner",
        "estimated_minutes": 30,
        "introduction": "Une adresse IPv4 contient 32 bits. En CIDR, /26 signifie que 26 bits identifient le préfixe réseau et que les 6 bits restants identifient les adresses à l’intérieur de ce sous-réseau.",
        "objectives": ["Convertir un préfixe /26 en masque.", "Calculer réseau, broadcast et plage utilisable.", "Calculer le nombre d’adresses d’hôtes et le réseau suivant."],
        "prerequisites": ["Savoir lire une adresse IPv4 décimale pointée.", "Connaître les opérations binaires de base est utile, mais non obligatoire."],
        "keywords": ["IPv4", "CIDR", "/26", "masque", "broadcast", "subnetting"],
        "application_context": "Le subnetting permet de dimensionner des segments et de réduire les domaines de broadcast, tout en réservant des plages adaptées au nombre d’équipements.",
        "common_errors": ["Confondre le nombre total d’adresses (64) avec les hôtes utilisables (62).", "Utiliser le premier octet seul pour trouver la taille du bloc alors que le préfixe varie dans le dernier octet."],
        "summary": "Pour 192.168.1.0/26, le masque est 255.255.255.192, le réseau .0, le broadcast .63, les hôtes .1 à .62, soit 62 adresses utilisables. Le sous-réseau /26 suivant commence en 192.168.1.64.",
        "further_reading": [{"label": "RFC 4632 — Classless Inter-domain Routing (CIDR)", "url": "https://www.rfc-editor.org/rfc/rfc4632"}],
        "chapters": [
            {
                "title": "Du préfixe au masque",
                "content": "Un préfixe /26 place 26 bits à 1 dans le masque. Les 24 premiers bits forment les deux premiers octets complets et les 2 bits réseau suivants se trouvent dans le troisième octet du masque : 11000000 en binaire, soit 192.\n\nLe masque complet est donc 255.255.255.192. Il reste 32 − 26 = 6 bits d’hôte.",
                "key_points": ["/26 équivaut à 255.255.255.192.", "Six bits d’hôte donnent 2^6 = 64 adresses au total."],
            },
            {
                "title": "Réseau, broadcast et hôtes",
                "content": "La taille du bloc dans le dernier octet est 256 − 192 = 64. Les réseaux commencent donc aux valeurs 0, 64, 128 et 192.\n\nPour le bloc 192.168.1.0/26, l’adresse réseau est 192.168.1.0. L’adresse de broadcast est la dernière valeur du bloc : 192.168.1.63. Les hôtes utilisables vont de 192.168.1.1 à 192.168.1.62, soit 64 − 2 = 62 adresses.",
                "key_points": ["Réseau : 192.168.1.0.", "Broadcast : 192.168.1.63.", "Plage utilisable : 192.168.1.1–192.168.1.62."],
            },
            {
                "title": "Trouver le sous-réseau suivant",
                "content": "Le bloc contient 64 adresses. On ajoute donc 64 à l’identifiant du réseau : après 192.168.1.0/26 vient 192.168.1.64/26. Ce réseau couvre .64 à .127 ; son broadcast est .127 et sa plage utilisable va de .65 à .126.\n\nLa méthode consiste à repérer l’octet où le masque n’est ni 255 ni 0, puis à calculer la taille du bloc dans cet octet.",
                "key_points": ["Réseau suivant : 192.168.1.64/26.", "Chaque /26 IPv4 classique réserve une adresse réseau et une adresse broadcast."],
            },
        ],
        "exercises": [
            {
                "title": "Masque du préfixe",
                "question_type": "single_choice",
                "question": "Quel masque correspond à 192.168.1.0/26 ?",
                "choices": [{"value": "255.255.255.0", "label": "255.255.255.0"}, {"value": "255.255.255.192", "label": "255.255.255.192"}, {"value": "255.255.255.224", "label": "255.255.255.224"}],
                "correct_answer": "255.255.255.192",
                "explanation": "Un /26 contient 26 bits à 1 : 24 bits donnent 255.255.255 et les deux bits suivants donnent 192 dans le dernier octet.",
            },
            {
                "title": "Plage utilisable",
                "question_type": "single_choice",
                "question": "Combien d’adresses IPv4 d’hôtes classiques sont utilisables dans un sous-réseau /26 ?",
                "choices": [{"value": "62", "label": "62"}, {"value": "64", "label": "64"}, {"value": "126", "label": "126"}],
                "correct_answer": "62",
                "explanation": "Il existe 2^6 = 64 adresses au total. Dans un sous-réseau IPv4 classique, réseau et broadcast ne sont pas attribués à des hôtes : 64 − 2 = 62.",
            },
        ],
    },
    {
        "category": "commutation-vlan",
        "title": "VLAN, ports access et trunks",
        "slug": "vlan-access-trunk",
        "description": "Comprendre la segmentation logique d’un switch et le transport de VLAN par des liens 802.1Q.",
        "level": "beginner",
        "estimated_minutes": 25,
        "introduction": "Un VLAN crée un domaine de broadcast logique au sein d’une infrastructure de commutation. Les ports access relient généralement un terminal à un VLAN ; un trunk transporte plusieurs VLAN entre équipements compatibles.",
        "objectives": ["Expliquer l’isolation logique apportée par un VLAN.", "Distinguer port access et trunk.", "Reconnaître le rôle des tags 802.1Q dans PocketNet."],
        "prerequisites": ["Connaître le rôle d’un switch Ethernet et d’une adresse MAC."],
        "keywords": ["VLAN", "access", "trunk", "802.1Q", "broadcast", "switch"],
        "application_context": "Les VLAN séparent des groupes logiques — par exemple postes, invités et administration — sans exiger un switch physique distinct par groupe.",
        "common_errors": ["Croire qu’un VLAN assure à lui seul le routage entre réseaux.", "Oublier que les deux extrémités d’un trunk doivent autoriser les VLAN attendus.", "Confondre VLAN natif et absence générale de marquage."],
        "summary": "Un port access associe un terminal à un VLAN. Un trunk transporte plusieurs VLAN avec des tags 802.1Q, selon la configuration des deux côtés. Le routage inter-VLAN demande une fonction de couche 3.",
        "further_reading": [{"label": "IEEE 802.1Q — Bridges and Bridged Networks", "url": "https://standards.ieee.org/standard/802_1Q-2022.html"}],
        "chapters": [
            {
                "title": "Segmenter un réseau avec des VLAN",
                "content": "Un VLAN regroupe logiquement des ports et limite la diffusion Ethernet à ses membres. Deux hôtes placés dans des VLAN différents ne communiquent pas directement au niveau Layer 2 ; une fonction de couche 3 est nécessaire pour les faire communiquer.\n\nLa séparation logique améliore l’organisation et peut contribuer à la sécurité, mais elle ne remplace ni les politiques de filtrage ni une conception correcte.",
                "key_points": ["Chaque VLAN constitue un domaine de broadcast distinct.", "Un switch Layer 2 ne réalise pas automatiquement le routage inter-VLAN."],
            },
            {
                "title": "Access et trunk 802.1Q",
                "content": "Un port access est associé à un VLAN et transporte généralement les trames d’un seul VLAN vers un terminal. Un trunk relie des équipements réseau et peut transporter plusieurs VLAN.\n\n802.1Q ajoute une information de VLAN aux trames transportées sur le trunk, avec des règles particulières pour le VLAN natif selon la configuration. Les deux extrémités doivent avoir des paramètres compatibles.",
                "key_points": ["Access : association d’un port à un VLAN.", "Trunk : transport de plusieurs VLAN.", "Les listes de VLAN autorisés doivent correspondre au besoin."],
            },
            {
                "title": "Mise en pratique et limites du simulateur",
                "content": "Dans PocketNet, les VLAN d’accès et les trunks 802.1Q influencent le transfert réel des trames du moteur. La console switch propose un sous-ensemble pédagogique de commandes IOS.\n\nSTP, EtherChannel, routage inter-VLAN par SVI et plusieurs autres fonctions ne sont pas simulés. Une topologie en boucle peut donc se comporter différemment d’un réseau protégé par STP.",
                "key_points": ["Tester l’isolation avec deux hôtes placés dans des VLAN différents.", "STP n’est pas implémenté dans PocketNet ; ne pas relier des boucles en production."],
            },
        ],
        "exercises": [
            {
                "title": "Choisir un port trunk",
                "question_type": "single_choice",
                "question": "Quel mode de port est généralement utilisé pour transporter plusieurs VLAN entre deux switches ?",
                "choices": [{"value": "access", "label": "Access"}, {"value": "trunk", "label": "Trunk"}, {"value": "shutdown", "label": "Shutdown"}],
                "correct_answer": "trunk",
                "explanation": "Un trunk transporte plusieurs VLAN, souvent au moyen du marquage 802.1Q. Un port access est associé à un VLAN pour un terminal.",
            },
        ],
    },
    {
        "category": "routage",
        "title": "Comprendre le routage IPv4",
        "slug": "routage-ipv4-statique",
        "description": "Découvrir comment un routeur choisit une interface de sortie et comment une route statique décrit un prochain saut.",
        "level": "intermediate",
        "estimated_minutes": 30,
        "introduction": "Un routeur transmet des paquets IP entre réseaux. Il compare l’adresse de destination aux routes connues et utilise la route la plus spécifique correspondante ; une route par défaut sert lorsqu’aucune route plus précise ne correspond.",
        "objectives": ["Distinguer réseau directement connecté et route statique.", "Expliquer le prochain saut.", "Comprendre le choix par préfixe le plus long."],
        "prerequisites": ["Connaître IPv4, le masque de sous-réseau et la passerelle par défaut."],
        "keywords": ["routeur", "table de routage", "route statique", "next hop", "préfixe"],
        "application_context": "Les routes statiques conviennent aux petits réseaux stables et aux routes de secours ; les infrastructures plus grandes utilisent souvent des protocoles de routage dynamique.",
        "common_errors": ["Configurer un prochain saut injoignable.", "Oublier la route de retour.", "Confondre la passerelle d’un hôte avec une route connue de tous les routeurs."],
        "summary": "Le routeur consulte sa table, choisit la route correspondante la plus spécifique et transmet le paquet vers l’interface et le prochain saut associés. La connectivité exige des routes aller et retour.",
        "further_reading": [{"label": "RFC 1812 — Requirements for IP Version 4 Routers", "url": "https://www.rfc-editor.org/rfc/rfc1812"}],
        "chapters": [
            {
                "title": "Routes connectées et statiques",
                "content": "Quand une interface configurée est active, son réseau peut apparaître comme directement connecté. Une route statique est ajoutée par un administrateur pour indiquer un préfixe distant et, selon l’implémentation, une interface de sortie ou un prochain saut.\n\nLa passerelle par défaut d’un hôte désigne le routeur auquel envoyer les destinations hors de son sous-réseau local.",
                "key_points": ["Une route connectée provient d’une interface active.", "Une route statique est configurée explicitement.", "La passerelle d’un hôte est le premier saut vers un réseau distant."],
            },
            {
                "title": "Choisir la route et vérifier le retour",
                "content": "Lorsqu’une destination correspond à plusieurs entrées, le principe du préfixe le plus long privilégie la route la plus spécifique. Une route par défaut (0.0.0.0/0) est moins spécifique que les routes de réseau.\n\nUn ping aller peut atteindre la destination sans que la réponse puisse revenir. Vérifiez donc la route dans les deux sens, l’état des interfaces et l’adresse source utilisée.",
                "key_points": ["Le préfixe le plus long gagne parmi les routes correspondantes.", "Une communication bidirectionnelle nécessite un chemin de retour."],
            },
            {
                "title": "Comportement dans PocketNet",
                "content": "Le moteur simule le transfert IPv4 entre routeurs dont les interfaces et routes statiques sont configurées ; les événements permettent d’observer le chemin et la décrémentation du TTL.\n\nRIP, OSPF, BGP, NAT, ACL et commandes IOS complètes ne sont pas fournis par ce laboratoire. Les résultats décrivent le modèle simplifié de PocketNet, pas toutes les opérations d’un routeur réel.",
                "key_points": ["Le routage statique IPv4 est disponible dans le modèle.", "Les protocoles de routage dynamique ne sont pas simulés."],
            },
        ],
        "exercises": [
            {
                "title": "Route la plus spécifique",
                "question_type": "single_choice",
                "question": "Une destination correspond à une route /24 et à une route /16. Laquelle est normalement choisie ?",
                "choices": [{"value": "16", "label": "La route /16"}, {"value": "24", "label": "La route /24"}, {"value": "default", "label": "Toujours la route par défaut"}],
                "correct_answer": "24",
                "explanation": "La route /24 possède le préfixe le plus long et correspond plus précisément à la destination.",
            },
        ],
    },
    {
        "category": "protocoles-services",
        "title": "ARP et ICMP : découvrir le voisin et tester une liaison",
        "slug": "arp-icmp",
        "description": "Distinguer la résolution d’adresse IPv4 en adresse MAC locale du diagnostic ICMP avec ping.",
        "level": "beginner",
        "estimated_minutes": 25,
        "introduction": "Sur un réseau IPv4 Ethernet, ARP aide un hôte à trouver l’adresse MAC correspondant à une adresse IPv4 voisine. ICMP transporte des messages de contrôle et de diagnostic, dont Echo Request et Echo Reply utilisés par ping.",
        "objectives": ["Décrire une requête et une réponse ARP.", "Expliquer le rôle de ping et des messages ICMP Echo.", "Savoir qu’ICMP n’utilise pas de ports TCP ou UDP."],
        "prerequisites": ["Connaître les notions d’adresse MAC, d’IPv4 et de réseau local."],
        "keywords": ["ARP", "ICMP", "ping", "adresse MAC", "broadcast"],
        "application_context": "Le dépannage d’un hôte IPv4 commence souvent par vérifier l’adresse, la résolution ARP locale, puis la réponse ICMP — sans conclure qu’un service applicatif fonctionne simplement parce qu’un ping répond.",
        "common_errors": ["Dire que ping vérifie un port TCP.", "Attendre une requête ARP pour une destination située derrière un routeur : l’hôte cherche normalement la MAC de sa passerelle locale."],
        "summary": "ARP résout une adresse IPv4 locale en adresse MAC sur le lien. ICMP fournit des messages de contrôle ; ping utilise Echo Request/Reply et ne teste pas un port applicatif.",
        "further_reading": [{"label": "RFC 826 — Ethernet Address Resolution Protocol", "url": "https://www.rfc-editor.org/rfc/rfc826"}, {"label": "RFC 792 — Internet Control Message Protocol", "url": "https://www.rfc-editor.org/rfc/rfc792"}],
        "chapters": [
            {
                "title": "Résolution ARP sur le lien local",
                "content": "Avant d’émettre une trame Ethernet vers un voisin IPv4 local, un hôte doit connaître l’adresse MAC de destination. S’il ne la connaît pas, il diffuse une requête ARP sur le lien. Le propriétaire de l’adresse IPv4 visée peut répondre avec sa MAC.\n\nPour une destination hors sous-réseau, l’hôte résout généralement l’adresse MAC de sa passerelle, et non celle de l’hôte distant.",
                "key_points": ["ARP associe une IPv4 locale à une MAC.", "La requête est diffusée sur le lien local.", "Le routage ne traverse pas les domaines de broadcast ARP."],
            },
            {
                "title": "ICMP et ping",
                "content": "ICMP est un protocole de contrôle associé à IP. Ping envoie un Echo Request et attend un Echo Reply lorsque le chemin et l’hôte l’autorisent. Un pare-feu, une politique ICMP ou une panne sur le chemin peut empêcher la réponse.\n\nICMP n’est pas TCP ou UDP et n’utilise donc pas de numéros de port. Une réponse ping confirme une réponse ICMP, pas la disponibilité d’un service Web ou d’une application.",
                "key_points": ["Ping teste une réponse ICMP Echo.", "ICMP n’utilise pas de ports TCP/UDP.", "Une absence de réponse ne localise pas à elle seule la panne."],
            },
        ],
        "exercises": [
            {
                "title": "Rôle d’ARP",
                "question_type": "single_choice",
                "question": "Sur Ethernet IPv4, quelle information ARP aide-t-il à découvrir sur le réseau local ?",
                "choices": [{"value": "mac", "label": "L’adresse MAC associée à une adresse IPv4 locale"}, {"value": "port", "label": "Le port TCP d’une application"}, {"value": "route", "label": "Le chemin complet à travers Internet"}],
                "correct_answer": "mac",
                "explanation": "ARP associe une adresse IPv4 voisine à une adresse MAC utilisable sur le lien Ethernet local.",
            },
        ],
    },
]


EQUIPMENT = [
    ("Ordinateur", "ordinateur", "Hôte d’un réseau local", "Un ordinateur émet et reçoit des données via une interface réseau. Il utilise notamment des adresses MAC et IP.", "simulated", "Les PC disposent d’une configuration IPv4, d’un terminal et d’une simulation ARP/ICMP. Les laptops sont représentés et partiellement pris en charge.", ["Interface Ethernet", "Adresse MAC", "Configuration IPv4"], "introduction-reseaux"),
    ("Switch Ethernet", "switch-ethernet", "Connexion et commutation des équipements", "Un switch Ethernet apprend les adresses MAC source et transfère les trames entre interfaces d’un réseau local.", "simulated", "Le moteur simule un modèle pédagogique Catalyst 2960, les VLAN d’accès, les trunks 802.1Q et un sous-ensemble de commandes CLI. STP n’est pas simulé.", ["Table MAC", "VLAN", "Ports access et trunk"], "vlan-access-trunk"),
    ("Routeur", "routeur", "Interconnexion de réseaux IP", "Un routeur transfère des paquets IPv4 entre réseaux selon ses interfaces et sa table de routage.", "simulated", "Le moteur prend en charge le routage IPv4 statique dans les topologies. Les protocoles dynamiques et plusieurs fonctions de routeur ne sont pas simulés.", ["Interfaces IPv4", "Routes statiques", "TTL"], "routage-ipv4-statique"),
    ("Laptop", "laptop", "Terminal mobile dans une topologie", "Un laptop représente un hôte relié au réseau. Son icône et son emplacement peuvent être utilisés dans les schémas.", "partial", "La gestion par interface utilisateur et les fonctions d’hôte ne sont pas aussi complètes que pour les PC.", ["Hôte terminal", "Interface réseau"], "introduction-reseaux"),
    ("Serveur", "serveur", "Ressource centralisée sur le réseau", "Un serveur fournit des fonctions à des clients, par exemple Web, DNS ou DHCP.", "reference", "Le serveur peut être placé et relié dans un schéma ; les services serveur ne sont pas implémentés dans le moteur.", ["Services applicatifs", "Modèle client-serveur"], "introduction-reseaux"),
    ("Point d’accès Wi-Fi", "point-acces-wifi", "Connexion sans fil des terminaux", "Un point d’accès relie des clients Wi-Fi à un réseau local sans fil.", "reference", "Le point d’accès est un élément de topologie visuel ; l’association Wi-Fi et le transfert radio ne sont pas simulés.", ["SSID", "Réseau radio", "Pont vers le LAN"], "introduction-reseaux"),
]


PROTOCOLS = [
    ("Ethernet", "ethernet", "Trames et communication sur un lien local", "Ethernet définit les formats de trame et des mécanismes de communication au niveau liaison sur les réseaux locaux.", ["Liaison de données"], "", "partial", "vlan-access-trunk"),
    ("ARP", "arp", "Résolution IPv4 vers MAC sur le lien local", "ARP diffuse une requête sur le segment local et permet au propriétaire de l’adresse IPv4 ciblée de répondre avec son adresse MAC.", ["Liaison de données", "Réseau"], "", "partial", "arp-icmp"),
    ("IPv4", "ipv4", "Adressage et acheminement des paquets", "IPv4 transporte des paquets avec des adresses source et destination. Les routeurs transmettent les paquets en fonction de leurs tables de routage.", ["Réseau"], "", "partial", "routage-ipv4-statique"),
    ("ICMP", "icmp", "Messages de contrôle et de diagnostic IP", "ICMP transporte des messages de contrôle tels que Echo Request/Reply. Il n’utilise pas de ports TCP ou UDP.", ["Réseau"], "", "partial", "arp-icmp"),
    ("802.1Q", "ieee-802-1q", "Identification des VLAN sur les trunks Ethernet", "Le marquage 802.1Q permet de transporter l’identifiant VLAN dans les trames sur un lien trunk, selon les règles de la norme et la configuration des équipements.", ["Liaison de données"], "", "partial", "vlan-access-trunk"),
    ("DNS", "dns", "Résolution de noms en informations réseau", "DNS distribue des informations nommées, notamment des correspondances entre noms de domaine et adresses IP. PocketNet ne simule pas de serveur DNS.", ["Application"], "UDP/TCP 53", "reference", None),
]


def seed_content(apps, schema_editor):
    Category = apps.get_model("learning", "LearningCategory")
    Course = apps.get_model("learning", "Course")
    Chapter = apps.get_model("learning", "Chapter")
    Exercise = apps.get_model("learning", "Exercise")
    EquipmentModel = apps.get_model("learning", "Equipment")
    ProtocolModel = apps.get_model("learning", "Protocol")
    database = schema_editor.connection.alias

    categories = {}
    for order, (title, slug, description, icon) in enumerate(CATEGORIES, start=1):
        category, _ = Category.objects.using(database).update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "description": description,
                "icon": icon,
                "order": order,
                "is_published": True,
            },
        )
        categories[slug] = category

    courses = {}
    for order, data in enumerate(COURSES, start=1):
        course_data = {key: value for key, value in data.items() if key not in {"chapters", "exercises", "category"}}
        course, _ = Course.objects.using(database).update_or_create(
            slug=data["slug"],
            defaults={
                **course_data,
                "category_id": categories[data["category"]].pk,
                "order": order,
                "is_published": True,
            },
        )
        Chapter.objects.using(database).filter(course_id=course.pk).delete()
        Chapter.objects.using(database).bulk_create([
            Chapter(
                course_id=course.pk,
                title=chapter["title"],
                content=chapter["content"],
                key_points=chapter["key_points"],
                order=chapter_order,
            )
            for chapter_order, chapter in enumerate(data["chapters"], start=1)
        ])
        Exercise.objects.using(database).filter(course_id=course.pk).delete()
        Exercise.objects.using(database).bulk_create([
            Exercise(
                course_id=course.pk,
                title=exercise["title"],
                question_type=exercise["question_type"],
                question=exercise["question"],
                choices=exercise["choices"],
                correct_answer=exercise["correct_answer"],
                explanation=exercise["explanation"],
                level=data["level"],
                order=exercise_order,
                is_published=True,
            )
            for exercise_order, exercise in enumerate(data["exercises"], start=1)
        ])
        courses[data["slug"]] = course

    for order, row in enumerate(EQUIPMENT, start=1):
        name, slug, summary, role, availability, details, characteristics, course_slug = row
        EquipmentModel.objects.using(database).update_or_create(
            slug=slug,
            defaults={
                "name": name,
                "summary": summary,
                "role": role,
                "simulator_availability": availability,
                "simulator_details": details,
                "characteristics": characteristics,
                "course_id": courses[course_slug].pk,
                "order": order,
                "is_published": True,
            },
        )

    for order, row in enumerate(PROTOCOLS, start=1):
        name, slug, summary, description, layers, port, availability, course_slug = row
        ProtocolModel.objects.using(database).update_or_create(
            slug=slug,
            defaults={
                "name": name,
                "summary": summary,
                "description": description,
                "layers": layers,
                "port": port,
                "simulator_availability": availability,
                "course_id": courses[course_slug].pk if course_slug else None,
                "order": order,
                "is_published": True,
            },
        )


def remove_content(apps, schema_editor):
    Category = apps.get_model("learning", "LearningCategory")
    Course = apps.get_model("learning", "Course")
    EquipmentModel = apps.get_model("learning", "Equipment")
    ProtocolModel = apps.get_model("learning", "Protocol")
    database = schema_editor.connection.alias
    EquipmentModel.objects.using(database).filter(slug__in=[row[1] for row in EQUIPMENT]).delete()
    ProtocolModel.objects.using(database).filter(slug__in=[row[1] for row in PROTOCOLS]).delete()
    Course.objects.using(database).filter(slug__in=[course["slug"] for course in COURSES]).delete()
    Category.objects.using(database).filter(slug__in=[category[1] for category in CATEGORIES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("learning", "0002_course_application_context_course_common_errors_and_more"),
    ]

    operations = [
        migrations.RunPython(seed_content, remove_content),
    ]
