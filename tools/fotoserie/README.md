# Fotoseries in 3D

Een fotoserie is een logregel met `#fotoserie` en minstens twee foto's: elke foto een stap verder opzij, steeds op hetzelfde onderwerp. BuildPM plaatst zo'n serie op de achtergrond in een bestaand 3D-model van de bouwplek. Per serie komt er dan een overzicht met:

- waar elke foto genomen is (in cm, in het assenstelsel van het ontwerpmodel);
- nieuwe punten in 3D uit de serie (`points.ply`);
- een plattegrond met de camerastanden (`plan.jpg`);
- optioneel elke foto naast een render van het model vanaf dezelfde plek (`vergelijk-N.jpg`).

De resultaten zijn afgeleide gegevens en staan in `.data/fotoserie/series/<id>/`. De logregel in de vault blijft de bron.

## Nodig

- Docker met GPU-toegang en de image `colmap/colmap` (COLMAP 4.x).
- Een referentiemodel (zie hieronder). Zonder `SERIES_REFERENCE` doet BuildPM niets met series.
- Optioneel Blender voor de vergelijkingsbeelden: `SERIES_RENDER_BLEND` wijst naar een `.blend` in hetzelfde assenstelsel (cm). Zet `BLENDER` als `blender` niet in het `PATH` staat.

## Referentiemodel bouwen

Het referentiemodel komt uit een bestaand, uitgelijnd Metashape-project. De camerastanden en de kalibratie worden overgenomen, zonder nieuwe structure-from-motion. COLMAP trianguleert er alleen punten bij.

```bash
node tools/fotoserie/reference.mjs --doc pad/naar/project.files/0/chunk.zip --images pad/naar/fotos --transform transform.json --out .data/fotoserie/reference --holdout 4x3
```

- `transform.json` bevat `{ "chunkToModelCm": [[…], […], […], [0, 0, 0, 1]] }`: de 4×4-matrix van Metashape-coördinaten naar het ontwerpmodel in cm. Bijvoorbeeld de wereldmatrix van de uitgelijnde scan in Blender.
- `--holdout 4x3` houdt drie reeksen van vier opeenvolgende foto's apart. Hun bekende standen dienen als test: `register.mjs` op zo'n reeks hoort ze binnen enkele centimeters terug te vinden.

Eén serie plaatsen kan ook met de hand:

```bash
node tools/fotoserie/register.mjs --reference .data/fotoserie/reference --out <map met job.json> [--render scene.blend]
```

`job.json` is `{ "images": ["/pad/foto1.jpg", …] }`. Zet `KEEP_WORK=1` om de COLMAP-werkmap te bewaren.

## Hoe het werkt

1. De foto's van de serie krijgen SIFT-kenmerken. Ze worden vergeleken met alle foto's van het referentiemodel en met elkaar.
2. `image_registrator` plaatst ze in het referentiemodel. De standen van de referentiefoto's blijven vast.
3. `point_triangulator` voegt de nieuwe punten toe.
4. Het script beschrijft de uitkomst. Het geeft ook adviezen, bijvoorbeeld als twee foto's bijna vanaf dezelfde plek genomen zijn.

COLMAP leest de ruwe pixels en negeert de EXIF-rotatie. Foto's worden daarom per ruwe afmeting gegroepeerd, met één camera per groep.
