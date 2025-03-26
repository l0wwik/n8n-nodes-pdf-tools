import { PDFDocument } from 'pdf-lib';
import { IExecuteFunctions } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

function parsePageRanges(input: string, maxPages: number): number[] {
	const parts = input.split(/[\s;,\n]+/); // Séparateurs : ; , espace ou retour ligne
	const pages: number[] = [];

	for (const part of parts) {
		if (part.includes('-')) {
			const [startStr, endStr] = part.split('-');
			const start = parseInt(startStr.trim(), 10);
			const end = parseInt(endStr.trim(), 10);
			if (!isNaN(start) && !isNaN(end)) {
				for (let i = start; i <= end && i <= maxPages; i++) {
					pages.push(i - 1); // -1 pour index 0-based
				}
			}
		} else {
			const p = parseInt(part.trim(), 10);
			if (!isNaN(p) && p >= 1 && p <= maxPages) {
				pages.push(p - 1);
			}
		}
	}

	// Suppression des doublons et tri
	return [...new Set(pages)].sort((a, b) => a - b);
}

export class SplitPdf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Split PDF',
		name: 'splitPdf',
		group: ['transform'],
		version: 1,
		description: 'Extract specific pages from a PDF file',
		defaults: {
			name: 'Split PDF',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'PDF',
				name: 'base64',
				type: 'string',
				default: '',
				description: 'Le contenu du PDF encodé en base64',
			},
			{
				displayName: 'Pages',
				name: 'pages',
				type: 'string',
				default: '1',
				description: 'Exemple : 1-3;5;8-10',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const base64Data = this.getNodeParameter('base64', i) as string;
			const pagesParam = this.getNodeParameter('pages', i) as string;

			const pdfBuffer = Buffer.from(base64Data, 'base64');
			const pdfDoc = await PDFDocument.load(pdfBuffer);
			const totalPages = pdfDoc.getPageCount();

			const newPdf = await PDFDocument.create();
			const pagesToExtract = parsePageRanges(pagesParam, totalPages);

			const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract);
			copiedPages.forEach((page) => newPdf.addPage(page));

			const newPdfBytes = await newPdf.save();
			const newBinary = await this.helpers.prepareBinaryData(
				Buffer.from(newPdfBytes),
				'extracted-pages.pdf',
				'application/pdf',
			);

			returnItems.push({
				binary: {
					data: newBinary,
				},
				json: {},
			});
		}

		return [returnItems];
	}
}

module.exports = { SplitPdf };
