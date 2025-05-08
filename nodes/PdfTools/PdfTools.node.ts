// PdfOperations.ts
import { PDFDocument, rgb } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import { NodeOperationError, INode, IBinaryData, INodeExecutionData } from 'n8n-workflow';

export enum Operation {
	AddImage = 'addImage',
	Merge = 'merge',
	ExtractText = 'extractText',
	Split = 'split',
}

type BinaryMatch = {
	buffer: Buffer;
	mimeType: string;
	fileName?: string;
};

type BinaryMatchResult = {
	pdf?: BinaryMatch;
	image?: BinaryMatch;
};

export class PdfOperations {
	static findBinaryByMimeType(items: INodeExecutionData[], mimeType: string): BinaryMatch | undefined {
		for (const item of items) {
			if (!item.binary) continue;
			for (const binary of Object.values(item.binary)) {
				if (binary.mimeType === mimeType) {
					return {
						buffer: Buffer.from(binary.data, 'base64'),
						mimeType: binary.mimeType,
						fileName: binary.fileName,
					};
				}
			}
		}
		return undefined;
	}

	static ensureMimeType(binary: IBinaryData, expectedTypes: string[], node: INode, itemIndex: number): void {
		if (!expectedTypes.includes(binary.mimeType)) {
			throw new NodeOperationError(node, `Unsupported MIME type: ${binary.mimeType}. Expected: ${expectedTypes.join(', ')}`, { itemIndex });
		}
	}

	static async addImage(
		pdfBuffer: Buffer,
		imageBuffer: Buffer,
		imageMimeType: string,
		pageIndexes: number[],
		imageOptions: { x: number; y: number; scale: number },
	): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		let image;
		if (imageMimeType === 'image/png') {
			image = await pdfDoc.embedPng(imageBuffer);
		} else if (imageMimeType === 'image/jpeg') {
			image = await pdfDoc.embedJpg(imageBuffer);
		} else {
			throw new Error(`Unsupported image format: ${imageMimeType}`);
		}
		const { width, height } = image.scale(imageOptions.scale);
		for (const pageIndex of pageIndexes) {
			const page = pdfDoc.getPage(pageIndex);
			page.drawImage(image, { x: imageOptions.x, y: imageOptions.y, width, height });
		}
		return Buffer.from(await pdfDoc.save());
	}

	static async mergePDFs(pdfBuffers: Buffer[]): Promise<Buffer> {
		const mergedPdf = await PDFDocument.create();
		for (const buffer of pdfBuffers) {
			const doc = await PDFDocument.load(buffer);
			const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
			pages.forEach((p) => mergedPdf.addPage(p));
		}
		return Buffer.from(await mergedPdf.save());
	}

	static async extractText(pdfBuffer: Buffer): Promise<string> {
		const data = await pdfParse(pdfBuffer);
		return data.text;
	}

	static async countPages(pdfBuffer: Buffer): Promise<number> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		return pdfDoc.getPageCount();
	}

	static async splitPDF(pdfBuffer: Buffer, pageIndexes: number[]): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const newPdf = await PDFDocument.create();
		for (const index of pageIndexes) {
			const [copiedPage] = await newPdf.copyPages(pdfDoc, [index]);
			newPdf.addPage(copiedPage);
		}
		return Buffer.from(await newPdf.save());
	}

	static parsePageRange(pages: string, totalPages: number): number[] {
		if (pages.trim().toLowerCase() === 'all') {
			return Array.from({ length: totalPages }, (_, i) => i);
		}
		const indices: number[] = [];
		for (const part of pages.split(',')) {
			if (part.includes('-')) {
				const [start, end] = part.split('-').map((n) => parseInt(n.trim(), 10));
				for (let i = start; i <= end; i++) {
					if (i >= 1 && i <= totalPages) indices.push(i - 1);
				}
			} else {
				const num = parseInt(part.trim(), 10);
				if (num >= 1 && num <= totalPages) indices.push(num - 1);
			}
		}
		return indices;
	}
}

// PdfTools.node.ts
import { IExecuteFunctions } from 'n8n-core';
import { INodeExecutionData, INodeType, INodeTypeDescription, NodeOperationError } from 'n8n-workflow';
import { Operation, PdfOperations } from './PdfOperations';

export class PdfTools implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PDF Tools',
		name: 'pdfTools',
		icon: 'file:pdfTools.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Perform operations on PDF files',
		defaults: {
			name: 'PDF Tools',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				default: Operation.AddImage,
				options: [
					{ name: 'Add Image', value: Operation.AddImage },
					{ name: 'Merge PDFs', value: Operation.Merge },
					{ name: 'Extract Text', value: Operation.ExtractText },
					{ name: 'Split PDF', value: Operation.Split },
				],
			},
			{
				displayName: 'PDF Binary Field',
				name: 'pdfBinaryName',
				type: 'string',
				default: 'pdf',
				description: 'Name of the binary field containing the PDF',
				displayOptions: {
					show: {
						operation: [Operation.AddImage, Operation.ExtractText, Operation.Split],
					},
				},
			},
			{
				displayName: 'Image Binary Field',
				name: 'imageBinaryName',
				type: 'string',
				default: 'image',
				description: 'Name of the binary field containing the image (PNG or JPEG)',
				displayOptions: {
					show: {
						operation: [Operation.AddImage],
					},
				},
			},
			{
				displayName: 'PDF Binary Field Names',
				name: 'pdfBinaryNames',
				type: 'string',
				default: '',
				description: 'Comma-separated list of binary field names to merge',
				displayOptions: {
					show: {
						operation: [Operation.Merge],
					},
				},
			},
			{
				displayName: 'Pages',
				name: 'pages',
				type: 'string',
				default: 'all',
				description: 'Pages to include (e.g., "1", "1,3-5", "all")',
				displayOptions: {
					show: {
						operation: [Operation.AddImage, Operation.Split],
					},
				},
			},
			{
				displayName: 'Image Options',
				name: 'imageOptions',
				type: 'collection',
				default: {},
				displayOptions: {
					show: {
						operation: [Operation.AddImage],
					},
				},
				options: [
					{ displayName: 'X Position', name: 'x', type: 'number', default: 50 },
					{ displayName: 'Y Position', name: 'y', type: 'number', default: 400 },
					{ displayName: 'Scale', name: 'scale', type: 'number', default: 0.5 },
				],
			},
			{
				displayName: 'Output File Name',
				name: 'outputFilename',
				type: 'string',
				default: 'output',
				description: 'Name of the output PDF file (without extension)',
				displayOptions: {
					show: {
						operation: [Operation.AddImage, Operation.Merge, Operation.Split],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as Operation;
				let result: Buffer | undefined;
				const outputFilename = this.getNodeParameter('outputFilename', i, 'output') as string;

				switch (operation) {
					case Operation.AddImage: {
						const pdfField = this.getNodeParameter('pdfBinaryName', i) as string;
						const imageField = this.getNodeParameter('imageBinaryName', i) as string;
						const pages = this.getNodeParameter('pages', i, 'all') as string;
						const imageOptions = this.getNodeParameter('imageOptions', i) as { x: number; y: number; scale: number };

						const pdfBinary = this.helpers.assertBinaryData(i, pdfField);
						const imageBinary = this.helpers.assertBinaryData(i, imageField);
						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf'], this.getNode(), i);
						PdfOperations.ensureMimeType(imageBinary, ['image/png', 'image/jpeg'], this.getNode(), i);
						const totalPages = await PdfOperations.countPages(Buffer.from(pdfBinary.data, 'base64'));
						const pageIndexes = PdfOperations.parsePageRange(pages, totalPages);
						result = await PdfOperations.addImage(
							Buffer.from(pdfBinary.data, 'base64'),
							Buffer.from(imageBinary.data, 'base64'),
							imageBinary.mimeType,
							pageIndexes,
							imageOptions,
						);
						break;
					}
					case Operation.Merge: {
						const fieldList = this.getNodeParameter('pdfBinaryNames', i) as string;
						const pdfNames = fieldList.split(',').map(name => name.trim()).filter(Boolean);
						if (pdfNames.length < 2) throw new NodeOperationError(this.getNode(), 'At least two PDF fields are required for merging.', { itemIndex: i });
						const pdfBuffers: Buffer[] = pdfNames.map(name => {
							const binary = this.helpers.assertBinaryData(i, name);
							PdfOperations.ensureMimeType(binary, ['application/pdf'], this.getNode(), i);
							return Buffer.from(binary.data, 'base64');
						});
						result = await PdfOperations.mergePDFs(pdfBuffers);
						break;
					}
					case Operation.ExtractText: {
						const pdfField = this.getNodeParameter('pdfBinaryName', i) as string;
						const pdfBinary = this.helpers.assertBinaryData(i, pdfField);
						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf'], this.getNode(), i);
						const text = await PdfOperations.extractText(Buffer.from(pdfBinary.data, 'base64'));
						returnData.push({ json: { text } });
						continue;
					}
					case Operation.Split: {
						const pdfField = this.getNodeParameter('pdfBinaryName', i) as string;
						const pages = this.getNodeParameter('pages', i, '1') as string;
						const pdfBinary = this.helpers.assertBinaryData(i, pdfField);
						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf'], this.getNode(), i);
						const totalPages = await PdfOperations.countPages(Buffer.from(pdfBinary.data, 'base64'));
						const pageIndexes = PdfOperations.parsePageRange(pages, totalPages);
						result = await PdfOperations.splitPDF(Buffer.from(pdfBinary.data, 'base64'), pageIndexes);
						break;
					}
					default:
						throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, { itemIndex: i });
				}
				if (result) {
					returnData.push({
						json: {},
						binary: {
							[outputFilename]: {
								data: result.toString('base64'),
								fileName: `${outputFilename}.pdf`,
								mimeType: 'application/pdf',
							},
						},
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}
		return [returnData];
	}
}
