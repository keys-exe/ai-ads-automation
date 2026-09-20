---
description: Render the §16A deliverables as local HTML and open them
argument-hint: <slug>
allowed-tools: Bash, Read, SendUserFile
---

1. Run `npm run deliver -- $ARGUMENTS`.
2. Send the user `builds/<slug>/deliveries/index.html` with SendUserFile,
   `display: "render"`, so it opens rather than downloads.
3. Say in one line what was rendered and which widget each artefact took, per
   §16A's routing table. Nothing more — §16A: "Prose stays outside. The widget
   holds the artefact only. Response prose is short: what changed, what it
   costs, what to check."

The files are self-contained and open from disk. Nothing in them reaches the
network.
