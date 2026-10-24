# Beiträge zu Umstieg.

Danke, dass du etwas beitragen möchtest.

## Lizenz deiner Beiträge

Umstieg. steht unter der **AGPL-3.0-only** ([`LICENSE`](./LICENSE)) mit einer
**zusätzlichen Erlaubnis nach § 7 AGPL** für den Vertrieb über App-Marktplätze
wie den Apple App Store (Wortlaut in [`NOTICE`](./NOTICE)).

Mit einem Beitrag (Pull Request, Patch, Commit) erklärst du dich einverstanden,
dass er unter der AGPL-3.0-only **einschließlich dieser Erlaubnis**
veröffentlicht wird. Ohne sie dürfte die App mit deinem Code nicht mehr im App
Store erscheinen: Apples Nutzungsbedingungen sind „weitere Einschränkungen“, die
die AGPL allein verbietet (§ 10).

Beiträge, die nur unter der AGPL ohne die Erlaubnis stehen sollen, können wir
deshalb nicht annehmen.

## Ablauf

- Arbeitszweig ist `feat/mvp`; `main` ist die ausgelieferte Fassung.
- Vor dem Pull Request in `frontend/` und `backend/` jeweils
  `npm test && npm run lint` – nacheinander, nicht gleichzeitig.
- Zugangsdaten gehören nie ins Repository; welche nötig sind, zeigt
  [`.env.example`](./.env.example).
