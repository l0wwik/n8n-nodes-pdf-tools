# n8n-nodes-pdf-tools

Ce nœud permet d'effectuer diverses opérations sur les fichiers PDF.

## Installation

```bash
npm install n8n-nodes-pdf-tools
```

## Fonctionnalités

- Ajout d'images à un PDF
- Ajout de filigranes textuels
- Suppression de pages
- Extraction de pages
- Fusion de PDFs
- Lecture de métadonnées
- Réorganisation de pages
- Rotation de pages
- Division de PDFs
- Extraction de texte

## Configuration

### Ajout d'image
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Image Binary Field**: Nom du champ binaire contenant l'image (PNG ou JPEG)
- **Page Target**: Pages cibles (ex: "1", "1,3-5", "all")
- **Position**: 
  - X: Position horizontale (points)
  - Y: Position verticale (points)
  - Scale: Échelle de l'image (0.1 à 1.0)

### Ajout de filigrane
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Texte**: Texte du filigrane
- **Page Target**: Pages cibles (ex: "1", "1,3-5", "all")
- **Style**:
  - Taille de police (points)
  - Couleur (format hexadécimal)
  - Opacité (0.0 à 1.0)
  - Position X et Y

### Suppression de pages
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à supprimer (ex: "1", "1,3-5")

### Extraction de pages
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à extraire (ex: "1", "1,3-5")

### Fusion de PDFs
- **PDF Binary Field Names**: Liste des noms de champs binaires contenant les PDFs à fusionner (séparés par des virgules)

### Lecture de métadonnées
- **PDF Binary Field**: Nom du champ binaire contenant le PDF

### Réorganisation de pages
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Nouvel ordre des pages (ex: "3,1,2")

### Rotation de pages
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à faire pivoter (ex: "1", "1,3-5")
- **Angle**: Angle de rotation (90, 180, 270)

### Division de PDF
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à extraire (ex: "1", "1,3-5")

### Extraction de texte
- **PDF Binary Field**: Nom du champ binaire contenant le PDF

## Formats supportés

- PDF: application/pdf
- Images: image/png, image/jpeg

## Exemples d'utilisation

### Ajout d'une image à un PDF
```javascript
{
  "operation": "addImage",
  "binaryFields": {
    "pdfBinaryName": "document.pdf",
    "imageBinaryName": "logo.png"
  },
  "options": {
    "watermarkOptions": {
      "pageTarget": "all"
    }
  },
  "imageOptions": {
    "position": {
      "x": 50,
      "y": 400,
      "scale": 0.5
    }
  }
}
```

### Fusion de plusieurs PDFs
```javascript
{
  "operation": "merge",
  "binaryFields": {
    "pdfBinaryNames": "doc1.pdf,doc2.pdf,doc3.pdf"
  }
}
```

### Extraction de pages spécifiques
```javascript
{
  "operation": "extractPages",
  "binaryFields": {
    "pdfBinaryName": "document.pdf"
  },
  "options": {
    "pageOptions": {
      "pages": "1,3-5"
    }
  }
}
```

## Développement

### Installation des dépendances
```bash
npm install
```

### Build
```bash
npm run build
```

### Tests
```bash
npm test
```

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

