# Orbit Add-on Runtime

Un petit runtime JavaScript pour ajouter des extensions à **une application que vous possédez ou développez**. Orbit fournit un contrat de manifeste, un cycle de vie réversible, des permissions explicites, du stockage cloisonné, un bus d’événements et un mode de récupération.

> **Portée** — Orbit est un kit autonome et un exemple d’hôte. Il ne modifie pas Discord, ne patche aucune application tierce et n’inclut aucun chargeur mobile. Il n’est affilié à aucun service de messagerie.

## Pourquoi Orbit ?

Le système garde un périmètre volontairement petit et auditable :

- Les extensions exécutables sont enregistrées explicitement par l’application hôte ; Orbit ne télécharge ni n’évalue du code.
- Chaque manifeste déclare ses capacités (`storage`, `notifications`, `events`) ; les accès à l’API sont vérifiés à l’exécution.
- Les données de stockage sont préfixées par l’identifiant du plugin et les valeurs retournées sont copiées.
- Une erreur de démarrage ou de rappel est enregistrée sans interrompre les autres extensions.
- Le mode de récupération désactive les plugins actifs, retire le thème et bloque de nouvelles activations jusqu’à sa sortie explicite.
- Les thèmes utilisent une liste fermée de jetons de couleur, au lieu d’injecter du CSS arbitraire.
- La bibliothèque et sa CLI n’ont aucune dépendance d’exécution.

## Prérequis et démarrage

Node.js 20 ou plus récent est requis. Clonez ce dépôt, puis lancez les vérifications et la démonstration :

```bash
git clone <URL-DU-DEPOT>
cd orbit-addon-runtime
npm test
npm run demo
```

La CLI peut s’utiliser directement depuis le dépôt :

```bash
node bin/orbit.js help
node bin/orbit.js validate examples/addons/hello/addon.json
node bin/orbit.js init mon-premier-plugin
node bin/orbit.js validate mon-premier-plugin/addon.json
```

Après publication du paquet, `npx --yes --package orbit-addon-runtime orbit-addon init mon-plugin` (ou l’exécutable `orbit-addon`) créera un squelette de plugin. L’import de la bibliothèque reste `import { AddonHost } from "orbit-addon-runtime"`.

## Exemple d’hôte

```js
import { AddonHost } from "orbit-addon-runtime";
import manifest from "./addon.json" with { type: "json" };
import plugin from "./index.mjs";

const host = new AddonHost({
  onNotification: (item) => console.log(item.title, item.message),
});

host.install(manifest, plugin);
await host.enable(manifest.id);
host.emit("message:sent", { text: "Bonjour !" });

// Désactive proprement le plugin et ses abonnements aux événements.
await host.disable(manifest.id);
```

Pour les thèmes, enregistrez un manifeste `kind: "theme"`, puis appelez `host.activateTheme(id)`. La propriété `host.activeTheme` expose le nom et les jetons validés que l’application peut appliquer à son interface.

## Manifeste

```json
{
  "schemaVersion": 1,
  "id": "hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Affiche une notification quand un message est envoyé.",
  "kind": "plugin",
  "capabilities": ["events", "notifications"]
}
```

Les types pris en charge sont `plugin`, `theme`, `font` et `icon-pack`. Un thème peut fournir `theme.tokens` avec des clés autorisées telles que `background`, `surface`, `text`, `textMuted`, `accent` et `border`. Les extensions qui n’ont besoin d’aucun accès déclarent `"capabilities": []`.

## API d’extension

`start(context)` peut être synchrone ou asynchrone. `stop()` est optionnel. `context` fournit l’identité du plugin et trois API contrôlées par capacités :

- `context.storage.get/set/delete(key[, value])` — stockage local isolé par extension ;
- `context.notifications.show({ title, message, level? })` — notifications bornées en longueur ;
- `context.events.subscribe(name, callback)` et `publish(name, payload)` — événements simples, désabonnés automatiquement à l’arrêt.

Une capacité non déclarée lève `CapabilityError`. `host.getErrors()` donne le journal structuré des erreurs et `host.getNotifications()` les notifications de la session. `host.activateRecoveryMode()` arrête tous les plugins ; `host.exitRecoveryMode()` réautorise ensuite les activations.

## Sécurité : ce que le runtime garantit — et ne garantit pas

Les permissions sont un contrat d’accès à l’API Orbit, **pas une sandbox JavaScript**. Le code d’un plugin enregistré s’exécute dans le processus Node de l’hôte et peut utiliser les capacités natives de son environnement. N’installez que du code que vous avez relu et auquel vous faites confiance. Pour héberger des extensions tierces, l’application doit ajouter une vraie isolation (par exemple un processus séparé avec protocole IPC et liste blanche d’opérations). Orbit n’effectue ni signature cryptographique ni téléchargement de modules.

Le runtime a été conçu pour être intégré à une application contrôlée par son équipe. Le démonstrateur et les tests sont locaux ; aucun compte, service distant ou binaire propriétaire n’est requis.

## Développement

```bash
npm test                 # suite de tests Node intégrée
npm run validate:example # contrôle du manifeste de démonstration
npm run demo             # hôte miniature et plugins d’exemple
```

Voir [docs/architecture.md](docs/architecture.md) pour le modèle d’exécution et les décisions de conception, et [docs/roadmap.md](docs/roadmap.md) pour les extensions possibles.

## Licence

Apache-2.0 — voir [LICENSE](LICENSE).
