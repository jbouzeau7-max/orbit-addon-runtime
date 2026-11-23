# Architecture Orbit

## Composants

- `src/manifest.js` valide la forme et les capacités d’un manifeste. Les thèmes ont une liste blanche de jetons et de couleurs ; les modules ne fournissent jamais de CSS à exécuter.
- `src/host.js` gère les extensions installées, le cycle de vie, le bus d’événements, les erreurs et le thème actif. Il ne résout pas les chemins de fichiers et n’importe pas de code dynamique.
- `src/index.js` est la surface d’API publique.
- `bin/orbit.js` fournit `init` et `validate`, sans dépendance tierce.
- `examples/` contient un hôte miniature et des modules écrits localement, afin de montrer un flux d’intégration bout en bout.

## Modèle d’exécution

L’application crée un `AddonHost`, lit le manifeste d’un plugin local, importe explicitement son module, puis appelle `install`. `enable` appelle `start(context)` et ne considère le plugin actif qu’après la réussite de ce démarrage. Un échec est capturé, journalisé et marque uniquement le plugin comme `error`. À l’arrêt, Orbit appelle `stop` puis supprime les abonnements de ce plugin. `shutdown` désactive les plugins actifs et retire le thème courant.

Le stockage est en mémoire par défaut, isolé par préfixe d’identifiant, et les lectures/écritures font une copie structurée. Les hôtes durables peuvent remplacer cette implémentation dans une évolution future, mais le runtime de référence ne persiste pas de données entre processus.

## Récupération

`activateRecoveryMode()` pose le verrou avant d’arrêter les plugins, de sorte qu’aucune activation concurrente ultérieure ne soit acceptée. Les extensions passent à l’état `installed`, leurs abonnements sont retirés et le thème est désactivé. Un choix d’interface ou une action de l’administrateur est nécessaire pour `exitRecoveryMode()` ; Orbit ne redémarre rien silencieusement.

## Limites de sécurité

Les capacités limitent uniquement les appels faits via le contexte Orbit. Comme les extensions s’exécutent dans le même processus JavaScript, elles ne sont pas isolées contre un plugin malveillant. Le propriétaire de l’application doit être le chargeur de modules et la frontière de confiance. Les journaux d’erreur n’incluent pas de pile complète afin de réduire les fuites accidentelles de données.
