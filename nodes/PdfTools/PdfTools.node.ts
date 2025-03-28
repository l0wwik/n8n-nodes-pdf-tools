import { IExecuteFunctions } from 'n8n-core';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { degrees, PDFDocument } from 'pdf-lib';

export class PdfTools implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Tools',
		name: 'pdfTools',
		group: ['transform'],
		version: 1,
		description:
			'Perform various operations on PDF files such as merging, splitting, watermarking, and more.',
		defaults: {
			name: 'PDF Tools',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Add Image',
						value: 'addImage',
						action: 'Insert an image into a PDF file at a specific position',
					},
					{
						name: 'Add Watermark',
						value: 'watermark',
						action: 'Overlay watermark text on one or more pages of the PDF',
					},
					{
						name: 'Delete Pages',
						value: 'delete',
						action: 'Remove specific pages from the PDF document',
					},
					{
						name: 'Extract Text',
						value: 'extractText',
						action: 'Extract and return the text content from the PDF',
					},
					{
						name: 'Merge PDFs',
						value: 'merge',
						action: 'Combine multiple PDF files into one single document',
					},
					{
						name: 'Read Metadata',
						value: 'metadata',
						action: 'Retrieve metadata such as title author and creation date',
					},
					{
						name: 'Reorder Pages',
						value: 'reorder',
						action: 'Rearrange the pages of a PDF file in a custom order',
					},
					{
						name: 'Rotate Pages',
						value: 'rotate',
						action: 'Rotate specific pages to a given angle (90°, 180°, 270°)',
					},
					{
						name: 'Split PDF',
						value: 'split',
						action: 'Extract selected pages and save them as a new PDF document',
					},
				],
				default: 'split',
			},
			{
				displayName: 'PDF File',
				name: 'pdfFile',
				type: 'string',
				required: true,
				description: 'Binary data of the PDF file to process',
				default: '',
			},
			{
				displayName: 'Watermark Text',
				name: 'watermarkText',
				type: 'string',
				description: 'Text to overlay as a watermark on one or more pages',
				default: '',
				displayOptions: {
					show: {
						operation: ['watermark'],
					},
				},
			},
			{
				displayName: 'Image File',
				name: 'imageFile',
				type: 'string',
				description: 'Binary data of the image to insert into the PDF',
				default: '',
				displayOptions: {
					show: {
						operation: ['addImage'],
					},
				},
			},
			{
				displayName: 'Pages to Delete',
				name: 'pagesToDelete',
				type: 'string',
				description:
					'List of pages to remove, separated by commas, You can specify individual pages or ranges (e.g., "1,3,5-7")',
				default: '',
				displayOptions: {
					show: {
						operation: ['delete'],
					},
				},
			},
			{
				displayName: 'PDF Files to Merge',
				name: 'pdfFilesToMerge',
				type: 'string',
				description: 'List of PDF files to combine, provided as binary data, separated by commas',
				default: '',
				displayOptions: {
					show: {
						operation: ['merge'],
					},
				},
			},
			{
				displayName: 'New Page Order',
				name: 'newPageOrder',
				type: 'string',
				description: 'Reorder pages using a comma-separated list (e.g., "1,5,3,2,4")',
				default: '',
				displayOptions: {
					show: {
						operation: ['reorder'],
					},
				},
			},
			{
				displayName: 'Rotation Angle',
				name: 'rotationAngle',
				type: 'options',
				options: [
					{ name: '90°', value: 90 },
					{ name: '180°', value: 180 },
					{ name: '270°', value: 270 },
				],
				default: 90,
				description: 'Select the angle to rotate the specified pages',
				displayOptions: {
					show: {
						operation: ['rotate'],
					},
				},
			},
			{
				displayName: 'Pages to Extract',
				name: 'pagesToExtract',
				type: 'string',
				description:
					'Specify pages to extract as a new PDF. Use commas for individual pages and dashes for ranges (e.g., "4,5,6-8").',
				default: '',
				displayOptions: {
					show: {
						operation: ['split'],
					},
				},
			},
		],
	};
	async execute(this: PdfTools & IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const binaryData = this.helpers.assertBinaryData(i, 'pdfFile');
			const pdfBuffer = Buffer.from(binaryData.data, 'base64');
			let pdfDoc = await PDFDocument.load(pdfBuffer);
			let resultBuffer;

			switch (operation) {
				case 'delete':
					const pagesToDelete = this.getNodeParameter('pagesToDelete', i) as string;
					resultBuffer = await this.deletePages(pdfDoc, pagesToDelete);
					break;
				case 'merge':
					const pdfFilesToMerge = this.getNodeParameter('pdfFilesToMerge', i) as string;
					resultBuffer = await this.mergePDFs(pdfFilesToMerge);
					break;
				case 'reorder':
					const newPageOrder = this.getNodeParameter('newPageOrder', i) as string;
					resultBuffer = await this.reorderPages(pdfDoc, newPageOrder);
					break;
				case 'rotate':
					const pagesToRotate = this.getNodeParameter('pagesToRotate', i) as string;
					const rotationAngle = this.getNodeParameter('rotationAngle', i) as number; // Ajout du troisième argument !
					resultBuffer = await this.rotatePages(pdfDoc, pagesToRotate, rotationAngle);
					break;
				case 'split':
					const pagesToExtract = this.getNodeParameter('pagesToExtract', i) as string;
					resultBuffer = await this.splitPDF(pdfDoc, pagesToExtract);
					break;
				default:
					// eslint-disable-next-line n8n-nodes-base/node-execute-block-wrong-error-thrown
					throw new Error(`Operation ${operation} not supported.`);
			}

			returnData.push({
				json: {},
				binary: {
					pdfFile: {
						mimeType: 'application/pdf',
						data: resultBuffer.toString('base64'),
					},
				},
			});
		}

		return [returnData];
	}

	async deletePages(pdfDoc: PDFDocument, pages: string): Promise<Buffer> {
		const pagesToDelete = pages.split(',').map((p) => parseInt(p.trim()) - 1);
		pagesToDelete.sort((a, b) => b - a);
		pagesToDelete.forEach((page) => pdfDoc.removePage(page));
		return Buffer.from(await pdfDoc.save());
	}

	async mergePDFs(files: string): Promise<Buffer> {
		const mergedPdf = await PDFDocument.create();
		for (const file of files.split(',')) {
			const pdf = await PDFDocument.load(Buffer.from(file, 'base64'));
			const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
			copiedPages.forEach((page) => mergedPdf.addPage(page));
		}
		return Buffer.from(await mergedPdf.save());
	}

	async reorderPages(pdfDoc: PDFDocument, order: string): Promise<Buffer> {
		const newOrder = order.split(',').map((p) => parseInt(p.trim()) - 1);
		const newDoc = await PDFDocument.create();
		for (const index of newOrder) {
			const [copiedPage] = await newDoc.copyPages(pdfDoc, [index]);
			newDoc.addPage(copiedPage);
		}
		return Buffer.from(await newDoc.save());
	}

	async rotatePages(pdfDoc: PDFDocument, pages: string, angle: number): Promise<Buffer> {
		const pagesToRotate = this.parsePageSelection(pages, pdfDoc.getPageCount());

		pagesToRotate.forEach((pageIndex) => {
			const page = pdfDoc.getPages()[pageIndex];
			const currentRotation = page.getRotation().angle; // Obtenir l'angle actuel
			const newRotation = (currentRotation + angle) % 360; // Assurer une rotation dans [0, 360]
			page.setRotation(degrees(newRotation)); // Appliquer la rotation
		});

		return Buffer.from(await pdfDoc.save());
	}

	async splitPDF(pdfDoc: PDFDocument, pages: string): Promise<Buffer> {
		const selectedPages = this.parsePageSelection(pages, pdfDoc.getPageCount());
		const newPdf = await PDFDocument.create();

		for (const pageIndex of selectedPages) {
			const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
			newPdf.addPage(copiedPage);
		}

		return Buffer.from(await newPdf.save());
	}

	private parsePageSelection(selection: string, pageCount: number): number[] {
		const pages: number[] = [];

		selection.split(',').forEach((part) => {
			if (part.includes('-')) {
				const [start, end] = part.split('-').map((p) => parseInt(p.trim(), 10) - 1);
				for (let i = start; i <= end; i++) {
					if (i >= 0 && i < pageCount) {
						pages.push(i);
					}
				}
			} else {
				const index = parseInt(part.trim(), 10) - 1;
				if (index >= 0 && index < pageCount) {
					pages.push(index);
				}
			}
		});

		return [...new Set(pages)].sort((a, b) => a - b);
	}
}
