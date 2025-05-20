# PDF Tools Node for n8n

Ce nœud permet de manipuler des fichiers PDF avec diverses opérations.

## Fonctionnalités

- Ajouter une image à un PDF
- Ajouter un filigrane textuel
- Supprimer des pages
- Extraire des pages spécifiques
- Extraire le texte
- Fusionner plusieurs PDFs
- Lire les métadonnées
- Réorganiser les pages
- Faire pivoter des pages
- Diviser un PDF en plusieurs fichiers

## Installation

1. Copiez le dossier `PdfTools` dans le répertoire `nodes` de votre installation n8n
2. Redémarrez n8n
3. Le nœud sera disponible dans la catégorie "Transform"

## Utilisation

### Ajouter une image

1. Sélectionnez l'opération "Add Image"
2. Spécifiez le champ binaire contenant le PDF source
3. Spécifiez le champ binaire contenant l'image (PNG ou JPEG)
4. Configurez les options de positionnement de l'image

### Ajouter un filigrane

1. Sélectionnez l'opération "Add Watermark"
2. Spécifiez le champ binaire contenant le PDF source
3. Entrez le texte du filigrane
4. Configurez les options de style du filigrane

### Fusionner des PDFs

1. Sélectionnez l'opération "Merge PDFs"
2. Spécifiez la liste des champs binaires contenant les PDFs à fusionner
3. Les PDFs seront fusionnés dans l'ordre spécifié

### Extraire des pages

1. Sélectionnez l'opération "Extract Pages"
2. Spécifiez le champ binaire contenant le PDF source
3. Indiquez les pages à extraire (ex: "1", "1,3-5")

## Options communes

- **Page Target**: Spécifie les pages cibles (ex: "1", "1,3-5", "all")
- **Output Filename**: Nom du fichier de sortie (sans extension)

## Dépendances

- pdf-lib
- pdf-parse

## Support

Pour toute question ou problème, veuillez créer une issue sur le dépôt GitHub. 
