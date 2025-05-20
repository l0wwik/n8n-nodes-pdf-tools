import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IBinaryData,
	IBinaryKeyData,
	INode,
} from 'n8n-workflow';

import {
	degrees,
	PDFDocument,
	rgb,
} from 'pdf-lib';

import pdfParse from 'pdf-parse';

/**
 * PDF Tools Node for n8n
 *
 * This node provides a comprehensive set of tools for PDF manipulation in n8n workflows.
 * It supports various operations like adding images, watermarks, page management, and more.
 *
 * @example
 * // Adding an image to a PDF
 * const result = await PdfOperations.addImage(pdfBuffer, imageBuffer, 'image/png', '1,3-5', {
 *   x: 50,
 *   y: 400,
 *   scale: 0.5
 * });
 *
 * @example
 * // Merging multiple PDFs
 * const mergedPdf = await PdfOperations.mergePDFs([pdf1Buffer, pdf2Buffer]);
 *
 * @see {@link https://pdf-lib.js.org/} for underlying PDF manipulation library
 */

/**
 * Utility types for binary data handling
 * These types help manage binary data operations for PDFs and images
 *
 * @typedef {Object} BinaryMatch
 * @property {Buffer} buffer - The binary data buffer
 * @property {string} mimeType - The MIME type of the binary data
 * @property {string} [fileName] - Optional filename for the binary data
 *
 * @typedef {Object} BinaryMatchResult
 * @property {BinaryMatch} [pdf] - Optional PDF binary match
 * @property {BinaryMatch} [image] - Optional image binary match
 */
type BinaryMatch = {
	buffer: Buffer;
	mimeType: string;
	fileName?: string;
};

type BinaryMatchResult = {
	pdf?: BinaryMatch;
	image?: BinaryMatch;
};

/**
 * Available PDF operations
 * Each operation represents a specific PDF manipulation task
 *
 * @enum {string}
 * @readonly
 *
 * @example
 * // Using operations in code
 * switch (operation) {
 *   case Operation.AddImage:
 *     // Handle image addition
 *     break;
 *   case Operation.Merge:
 *     // Handle PDF merging
 *     break;
 * }
 */
enum Operation {
	AddImage = 'addImage',      // Add an image to PDF pages
	Watermark = 'watermark',    // Add text watermark to PDF pages
	Delete = 'delete',          // Remove specific pages from PDF
	ExtractPages = 'extractPages', // Extract specific pages into new PDF
	ExtractText = 'extractText',   // Extract text content from PDF
	Merge = 'merge',            // Combine multiple PDFs into one
	Metadata = 'metadata',      // Read PDF metadata
	Reorder = 'reorder',        // Change page order in PDF
	Rotate = 'rotate',          // Rotate specific pages
	Split = 'split',            // Split PDF into multiple files
}

/**
 * Class containing all PDF operations and utility methods
 * This class provides a comprehensive set of tools for PDF manipulation
 * including image handling, watermarking, page management, and metadata operations
 *
 * @class PdfOperations
 * @static
 *
 * @example
 * // Using the PdfOperations class
 * const pdfOps = new PdfOperations();
 * const result = await PdfOperations.addImage(pdfBuffer, imageBuffer, 'image/png');
 */
class PdfOperations {
	/**
	 * Finds a binary file by its MIME type in the input items
	 *
	 * @param {INodeExecutionData[]} items - Array of input items containing binary data
	 * @param {string} mimeType - MIME type to search for (e.g., 'application/pdf', 'image/png')
	 * @returns {BinaryMatch | undefined} Binary match object containing buffer, MIME type and filename, or undefined if not found
	 *
	 * @example
	 * const pdfBinary = PdfOperations.findBinaryByMimeType(items, 'application/pdf');
	 * if (pdfBinary) {
	 *   // Process PDF
	 * }
	 */
	static findBinaryByMimeType(items: INodeExecutionData[], mimeType: string): BinaryMatch | undefined {
		for (const item of items) {
			if (!item.binary) continue;

			for (const [_, binary] of Object.entries(item.binary)) {
				if (binary.mimeType === mimeType) {
					return {
						buffer: Buffer.from(binary.data, 'base64'),
						mimeType: binary.mimeType,
						fileName: binary.fileName
					};
				}
			}
		}
		return undefined;
	}

	/**
	 * Finds all binary files of a specific MIME type in the input items
	 * Useful for operations that require multiple files of the same type
	 *
	 * @param {INodeExecutionData[]} items - Array of input items containing binary data
	 * @param {string} mimeType - MIME type to search for (e.g., 'application/pdf')
	 * @returns {BinaryMatch[]} Array of binary match objects containing buffer, MIME type and filename
	 *
	 * @example
	 * // Find all PDF files in the input items
	 * const pdfFiles = PdfOperations.findAllBinariesByMimeType(items, 'application/pdf');
	 * pdfFiles.forEach(pdf => {
	 *   console.log(`Found PDF: ${pdf.fileName}`);
	 * });
	 */
	static findAllBinariesByMimeType(items: INodeExecutionData[], mimeType: string): BinaryMatch[] {
		const results: BinaryMatch[] = [];

		for (const item of items) {
			if (!item.binary) continue;

			for (const [_, binary] of Object.entries(item.binary)) {
				if (binary.mimeType === mimeType) {
					results.push({
						buffer: Buffer.from(binary.data, 'base64'),
						mimeType: binary.mimeType,
						fileName: binary.fileName
					});
				}
			}
		}
		return results;
	}

	/**
	 * Finds both PDF and image files in the input items
	 * Used for operations that require both a PDF and an image (e.g., adding image to PDF)
	 *
	 * @param {INodeExecutionData[]} items - Array of input items containing binary data
	 * @returns {BinaryMatchResult} Object containing PDF and image binary matches if found
	 *
	 * @example
	 * const { pdf, image } = PdfOperations.findPdfAndImage(items);
	 * if (pdf && image) {
	 *   // Process PDF with image
	 * }
	 */
	static findPdfAndImage(items: INodeExecutionData[]): BinaryMatchResult {
		const result: BinaryMatchResult = {};

		// Chercher d'abord un PDF
		result.pdf = this.findBinaryByMimeType(items, 'application/pdf');

		// Chercher une image (PNG ou JPEG)
		result.image = this.findBinaryByMimeType(items, 'image/png') ||
					  this.findBinaryByMimeType(items, 'image/jpeg');

		return result;
	}

	/**
	 * Validates that a binary file is a PDF
	 * Checks MIME type and throws error if not a valid PDF
	 *
	 * @param {IBinaryData | undefined} binary - Binary data to validate
	 * @param {INode} node - Current node instance for error reporting
	 * @param {number} itemIndex - Index of the current item
	 * @returns {Buffer} Buffer containing the PDF data
	 * @throws {NodeOperationError} If the file is not a PDF
	 *
	 * @example
	 * try {
	 *   const pdfBuffer = PdfOperations.validatePdfBinary(binary, node, 0);
	 *   // Process valid PDF
	 * } catch (error) {
	 *   console.error('Invalid PDF:', error.message);
	 * }
	 */
	static validatePdfBinary(binary: IBinaryData | undefined, node: INode, itemIndex: number): Buffer {
		if (!binary || binary.mimeType !== 'application/pdf') {
			throw new NodeOperationError(
				node,
				`Le fichier doit être au format PDF (MIME type: application/pdf). Type reçu: ${binary?.mimeType || 'aucun'}`,
				{ itemIndex },
			);
		}
		return Buffer.from(binary.data, 'base64');
	}

	/**
	 * Validates that a binary file is an image (PNG or JPEG)
	 * Checks MIME type and throws error if not a valid image
	 *
	 * @param {IBinaryData | undefined} binary - Binary data to validate
	 * @param {INode} node - Current node instance for error reporting
	 * @param {number} itemIndex - Index of the current item
	 * @returns {Buffer} Buffer containing the image data
	 * @throws {NodeOperationError} If the file is not a valid image
	 *
	 * @example
	 * try {
	 *   const imageBuffer = PdfOperations.validateImageBinary(binary, node, 0);
	 *   // Process valid image
	 * } catch (error) {
	 *   console.error('Invalid image:', error.message);
	 * }
	 */
	static validateImageBinary(binary: IBinaryData | undefined, node: INode, itemIndex: number): Buffer {
		if (!binary || (binary.mimeType !== 'image/png' && binary.mimeType !== 'image/jpeg')) {
			throw new NodeOperationError(
				node,
				`Le fichier doit être une image PNG ou JPEG. Type reçu: ${binary?.mimeType || 'aucun'}`,
				{ itemIndex },
			);
		}
		return Buffer.from(binary.data, 'base64');
	}

	/**
	 * Validates and parses page selection string
	 * Supports various page selection formats:
	 * - Single page: "1"
	 * - Multiple pages: "1,3,5"
	 * - Page ranges: "1-5"
	 * - All pages: "all"
	 *
	 * @param {string} pages - Page selection string
	 * @param {number} pageCount - Total number of pages in the PDF
	 * @returns {number[]} Array of page indices (0-based)
	 * @throws {NodeOperationError} If page numbers are invalid
	 *
	 * @example
	 * // Select pages 1, 3, and 5
	 * const pages = PdfOperations.validatePageSelection("1,3,5", 10);
	 *
	 * @example
	 * // Select pages 1 through 5
	 * const pages = PdfOperations.validatePageSelection("1-5", 10);
	 */
	static validatePageSelection(pages: string, pageCount: number): number[] {
		const pageNumbers = pages.split(',').map(p => {
			const trimmed = p.trim();
			if (trimmed.includes('-')) {
				const [start, end] = trimmed.split('-').map(n => parseInt(n));
				return Array.from({length: end - start + 1}, (_, i) => start + i - 1);
			}
			return parseInt(trimmed) - 1;
		}).flat();

		if (pageNumbers.some(p => p < 0 || p >= pageCount)) {
			throw new NodeOperationError(
				{ name: 'PDF Tools', type: 'n8n-nodes-base.pdftools' } as INode,
				`Invalid page numbers. Pages must be between 1 and ${pageCount}`
			);
		}

		return pageNumbers;
	}

	/**
	 * Ensures that a binary file has one of the expected MIME types
	 * Used for validating input files before processing
	 *
	 * @param {IBinaryData} binary - Binary data to check
	 * @param {string[]} expectedTypes - Array of allowed MIME types
	 * @throws {NodeOperationError} If the MIME type is not supported
	 *
	 * @example
	 * try {
	 *   PdfOperations.ensureMimeType(binary, ['image/png', 'image/jpeg']);
	 *   // Process valid image
	 * } catch (error) {
	 *   console.error('Unsupported MIME type:', error.message);
	 * }
	 */
	static ensureMimeType(binary: IBinaryData, expectedTypes: string[]): void {
		if (!expectedTypes.includes(binary.mimeType)) {
			throw new NodeOperationError(
				{ name: 'PDF Tools', type: 'n8n-nodes-base.pdftools' } as INode,
				`Type MIME non supporté: ${binary.mimeType}. Types attendus: ${expectedTypes.join(', ')}`
			);
		}
	}

	/**
	 * Adds an image to specified pages of a PDF
	 * Supports PNG and JPEG images
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {Buffer} imageBuffer - Buffer containing the image data
	 * @param {string} imageMimeType - MIME type of the image ('image/png' or 'image/jpeg')
	 * @param {string} [pageTarget='all'] - Target pages for the image (e.g., "1", "1,3-5", "all")
	 * @param {Object} [imageOptions] - Image positioning and scaling options
	 * @param {number} [imageOptions.x=50] - X coordinate for image position
	 * @param {number} [imageOptions.y=400] - Y coordinate for image position
	 * @param {number} [imageOptions.scale=0.5] - Image scale factor
	 * @returns {Promise<Buffer>} Buffer containing the modified PDF with embedded image
	 *
	 * @example
	 * const result = await PdfOperations.addImage(
	 *   pdfBuffer,
	 *   imageBuffer,
	 *   'image/png',
	 *   '1,3-5',
	 *   { x: 100, y: 200, scale: 0.75 }
	 * );
	 */
	static async addImage(
		pdfBuffer: Buffer,
		imageBuffer: Buffer,
		imageMimeType: string,
		pageTarget: string = 'all',
		imageOptions: { x: number; y: number; scale: number } = { x: 50, y: 400, scale: 0.5 },
	): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pageCount = pdfDoc.getPageCount();
		const targetPages = this.validatePageSelection(pageTarget, pageCount);

		let image;
		if (imageMimeType === 'image/png') {
			image = await pdfDoc.embedPng(imageBuffer);
		} else if (imageMimeType === 'image/jpeg') {
			image = await pdfDoc.embedJpg(imageBuffer);
		} else {
			throw new NodeOperationError(
				{ name: 'PDF Tools', type: 'n8n-nodes-base.pdftools' } as INode,
				`Format d'image non supporté: ${imageMimeType}. Formats supportés: PNG, JPEG`
			);
		}

		const { width, height } = image.scale(imageOptions.scale);
		for (const pageIndex of targetPages) {
			const page = pdfDoc.getPage(pageIndex);
			page.drawImage(image, { x: imageOptions.x, y: imageOptions.y, width, height });
		}
		return Buffer.from(await pdfDoc.save());
	}

	/**
	 * Adds a watermark to specified pages of a PDF
	 * The watermark can be customized with various styling options
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} text - Watermark text
	 * @param {string} [pageTarget='all'] - Target pages for the watermark
	 * @param {Object} [watermarkOptions] - Watermark styling options
	 * @param {number} [watermarkOptions.fontSize=50] - Font size for watermark text
	 * @param {string} [watermarkOptions.color='#808080'] - Color of the watermark (hex format)
	 * @param {number} [watermarkOptions.opacity=0.3] - Opacity of the watermark (0-1)
	 * @param {number} [watermarkOptions.x=0] - X coordinate for watermark position
	 * @param {number} [watermarkOptions.y=0] - Y coordinate for watermark position
	 * @returns {Promise<Buffer>} Buffer containing the modified PDF with watermark
	 *
	 * @example
	 * const result = await PdfOperations.addWatermark(
	 *   pdfBuffer,
	 *   'CONFIDENTIAL',
	 *   'all',
	 *   { fontSize: 72, color: '#FF0000', opacity: 0.5 }
	 * );
	 */
	static async addWatermark(
		pdfBuffer: Buffer,
		text: string,
		pageTarget: string = 'all',
		watermarkOptions: { text: string; fontSize: number; color: string; opacity: number; x: number; y: number } = { text: '', fontSize: 50, color: '#808080', opacity: 0.3, x: 0, y: 0 },
	): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pageCount = pdfDoc.getPageCount();
		const targetPages = pageTarget === 'all'
			? Array.from({ length: pageCount }, (_, i) => i)
			: this.validatePageSelection(pageTarget, pageCount);

		for (const pageIndex of targetPages) {
			const page = pdfDoc.getPage(pageIndex);
			const { width, height } = page.getSize();
			page.drawText(text, {
				x: width / 2,
				y: height / 2,
				size: watermarkOptions.fontSize,
				opacity: watermarkOptions.opacity,
				color: rgb(
					parseInt(watermarkOptions.color.slice(1, 3), 16) / 255,
					parseInt(watermarkOptions.color.slice(3, 5), 16) / 255,
					parseInt(watermarkOptions.color.slice(5, 7), 16) / 255
				),
			});
		}
		return Buffer.from(await pdfDoc.save());
	}

	/**
	 * Deletes specified pages from a PDF
	 * Pages are removed in reverse order to maintain correct indices
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} pages - Pages to delete (e.g., "1", "1,3-5", "all")
	 * @returns {Promise<Buffer>} Buffer containing the modified PDF with specified pages removed
	 *
	 * @example
	 * // Delete pages 1 and 3-5
	 * const result = await PdfOperations.deletePages(pdfBuffer, "1,3-5");
	 */
	static async deletePages(pdfBuffer: Buffer, pages: string): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pagesToDelete = this.validatePageSelection(pages, pdfDoc.getPageCount());
		pagesToDelete.sort((a: number, b: number) => b - a);
		pagesToDelete.forEach((page: number) => pdfDoc.removePage(page));
		return Buffer.from(await pdfDoc.save());
	}

	/**
	 * Reorders pages in a PDF
	 * Creates a new PDF with pages in the specified order
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} order - New page order (e.g., "3,1,2" to put page 3 first)
	 * @returns {Promise<Buffer>} Buffer containing the reordered PDF
	 *
	 * @example
	 * // Reorder pages: put page 3 first, then page 1, then page 2
	 * const result = await PdfOperations.reorderPages(pdfBuffer, "3,1,2");
	 */
	static async reorderPages(pdfBuffer: Buffer, order: string): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pageCount = pdfDoc.getPageCount();
		const newOrder = this.validatePageSelection(order, pageCount);
		const newDoc = await PDFDocument.create();
		for (const index of newOrder) {
			const [copiedPage] = await newDoc.copyPages(pdfDoc, [index]);
			newDoc.addPage(copiedPage);
		}
		return Buffer.from(await newDoc.save());
	}

	/**
	 * Rotates specified pages in a PDF
	 * Supports rotation angles of 90, 180, or 270 degrees
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} pages - Pages to rotate (e.g., "1", "1,3-5", "all")
	 * @param {number} angle - Rotation angle in degrees (90, 180, or 270)
	 * @returns {Promise<Buffer>} Buffer containing the modified PDF with rotated pages
	 *
	 * @example
	 * // Rotate pages 1-3 by 90 degrees
	 * const result = await PdfOperations.rotatePages(pdfBuffer, "1-3", 90);
	 */
	static async rotatePages(pdfBuffer: Buffer, pages: string, angle: number): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pagesToRotate = this.validatePageSelection(pages, pdfDoc.getPageCount());
		pagesToRotate.forEach((pageIndex: number) => {
			const page = pdfDoc.getPages()[pageIndex];
			const currentRotation = page.getRotation().angle;
			const newRotation = (currentRotation + angle) % 360;
			page.setRotation(degrees(newRotation));
		});
		return Buffer.from(await pdfDoc.save());
	}

	/**
	 * Splits a PDF into multiple files
	 * Creates a new PDF containing only the specified pages
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} pages - Pages to extract (e.g., "1", "1,3-5", "all")
	 * @returns {Promise<Buffer>} Buffer containing the extracted pages as a new PDF
	 *
	 * @example
	 * // Extract pages 1-3 into a new PDF
	 * const result = await PdfOperations.splitPDF(pdfBuffer, "1-3");
	 */
	static async splitPDF(pdfBuffer: Buffer, pages: string): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pageCount = pdfDoc.getPageCount();
		const selectedPages = this.validatePageSelection(pages, pageCount);
		const newPdf = await PDFDocument.create();
		for (const pageIndex of selectedPages) {
			const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
			newPdf.addPage(copiedPage);
		}
		return Buffer.from(await newPdf.save());
	}

	/**
	 * Extracts specified pages from a PDF
	 * Similar to splitPDF but specifically for page extraction
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @param {string} pages - Pages to extract (e.g., "1", "1,3-5", "all")
	 * @returns {Promise<Buffer>} Buffer containing the extracted pages as a new PDF
	 *
	 * @example
	 * // Extract pages 1, 3, and 5
	 * const result = await PdfOperations.extractPages(pdfBuffer, "1,3,5");
	 */
	static async extractPages(pdfBuffer: Buffer, pages: string): Promise<Buffer> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const pageCount = pdfDoc.getPageCount();
		const selectedPages = this.validatePageSelection(pages, pageCount);
		const newPdf = await PDFDocument.create();
		for (const pageIndex of selectedPages) {
			const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageIndex]);
			newPdf.addPage(copiedPage);
		}
		return Buffer.from(await newPdf.save());
	}

	/**
	 * Merges multiple PDFs into a single file
	 * Preserves all pages from each input PDF in the order they are provided
	 *
	 * @param {Buffer[]} pdfBuffers - Array of buffers containing PDF data to merge
	 * @returns {Promise<Buffer>} Buffer containing the merged PDF
	 *
	 * @example
	 * const mergedPdf = await PdfOperations.mergePDFs([
	 *   pdf1Buffer,
	 *   pdf2Buffer,
	 *   pdf3Buffer
	 * ]);
	 */
	static async mergePDFs(pdfBuffers: Buffer[]): Promise<Buffer> {
		const mergedPdf = await PDFDocument.create();
		for (const pdfBuffer of pdfBuffers) {
			const pdf = await PDFDocument.load(pdfBuffer);
			const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
			copiedPages.forEach((page) => mergedPdf.addPage(page));
		}
		return Buffer.from(await mergedPdf.save());
	}

	/**
	 * Reads metadata from a PDF
	 * Extracts common PDF metadata fields
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @returns {Promise<Object>} Object containing PDF metadata fields
	 * @property {string} title - Document title
	 * @property {string} author - Document author
	 * @property {string} subject - Document subject
	 * @property {string} keywords - Document keywords
	 * @property {string} creator - Document creator
	 * @property {string} producer - Document producer
	 * @property {string} creationDate - Document creation date
	 * @property {string} modificationDate - Document modification date
	 *
	 * @example
	 * const metadata = await PdfOperations.readMetadata(pdfBuffer);
	 * console.log(`Document title: ${metadata.title}`);
	 * console.log(`Author: ${metadata.author}`);
	 */
	static async readMetadata(pdfBuffer: Buffer): Promise<{
		title: string;
		author: string;
		subject: string;
		keywords: string;
		creator: string;
		producer: string;
		creationDate: string;
		modificationDate: string;
	}> {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		return {
			title: pdfDoc.getTitle() || '',
			author: pdfDoc.getAuthor() || '',
			subject: pdfDoc.getSubject() || '',
			keywords: pdfDoc.getKeywords() || '',
			creator: pdfDoc.getCreator() || '',
			producer: pdfDoc.getProducer() || '',
			creationDate: pdfDoc.getCreationDate()?.toISOString() || '',
			modificationDate: pdfDoc.getModificationDate()?.toISOString() || '',
		};
	}

	/**
	 * Extracts text content from a PDF
	 * Uses pdf-parse library to extract text while preserving basic formatting
	 *
	 * @param {Buffer} pdfBuffer - Buffer containing the PDF data
	 * @returns {Promise<string>} Extracted text content as string
	 *
	 * @example
	 * const text = await PdfOperations.extractText(pdfBuffer);
	 * console.log(`Extracted text: ${text}`);
	 */
	static async extractText(pdfBuffer: Buffer): Promise<string> {
		const data = await pdfParse(pdfBuffer);
		return data.text;
	}
}

/**
 * Main PDF Tools node class implementing n8n node interface
 * This class provides the main interface for PDF manipulation operations in n8n
 * It handles the execution of various PDF operations and manages input/output data
 */
export class PdfTools implements INodeType {
	/**
	 * Node description and configuration
	 * Defines the node's properties, operations, and UI elements
	 * Includes:
	 * - Display name and icon
	 * - Available operations
	 * - Input/output configuration
	 * - Operation-specific parameters
	 */
	description: INodeTypeDescription = {
		displayName: 'PDF Tools',
		name: 'pdfTools',
		icon: 'file:pdfTools.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manipulate PDF files with various operations',
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
				noDataExpression: true,
				default: 'addImage',
				options: [
					{
						name: 'Add Image',
						value: Operation.AddImage,
						description: 'Add an image to an existing PDF',
						action: 'Add an image to a PDF',
					},
					{
						name: 'Add Watermark',
						value: Operation.Watermark,
						description: 'Add a text watermark to a PDF',
						action: 'Add a watermark to a PDF',
					},
					{
						name: 'Delete Pages',
						value: Operation.Delete,
						description: 'Delete specific pages from a PDF',
						action: 'Delete pages from a PDF',
					},
					{
						name: 'Extract Pages',
						value: Operation.ExtractPages,
						description: 'Extract specific pages into a new PDF',
						action: 'Extract pages from a PDF',
					},
					{
						name: 'Extract Text',
						value: Operation.ExtractText,
						description: 'Extract text content from a PDF',
						action: 'Extract text from a PDF',
					},
					{
						name: 'Merge PDFs',
						value: Operation.Merge,
						description: 'Merge multiple PDFs into one',
						action: 'Merge multiple PDF',
					},
					{
						name: 'Read Metadata',
						value: Operation.Metadata,
						description: 'Read metadata from a PDF',
						action: 'Read metadata from a PDF',
					},
					{
						name: 'Reorder Pages',
						value: Operation.Reorder,
						description: 'Reorder pages in a PDF',
						action: 'Reorder pages in a PDF',
					},
					{
						name: 'Rotate Pages',
						value: Operation.Rotate,
						description: 'Rotate pages in a PDF',
						action: 'Rotate pages in a PDF',
					},
					{
						name: 'Split PDF',
						value: Operation.Split,
						description: 'Split a PDF into multiple files',
						action: 'Split a PDF into multiple files',
					},
				],
			},
			{
				displayName: 'PDF Binary Field',
				name: 'pdfBinaryName',
				type: 'string',
				default: '',
				description: 'Name of the binary field containing the PDF',
				displayOptions: {
					show: {
						operation: [
							Operation.AddImage,
							Operation.Watermark,
							Operation.Delete,
							Operation.ExtractPages,
							Operation.ExtractText,
							Operation.Metadata,
							Operation.Reorder,
							Operation.Rotate,
							Operation.Split,
						],
					},
				},
			},
			{
				displayName: 'Image Binary Field',
				name: 'imageBinaryName',
				type: 'string',
				default: '',
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
				description: 'Comma-separated list of binary field names containing PDFs to merge',
				displayOptions: {
					show: {
						operation: [Operation.Merge],
					},
				},
				hint: 'Enter the names of the binary fields containing PDFs, separated by commas',
			},
			{
				displayName: 'New Page Order',
				name: 'newPageOrder',
				type: 'string',
				default: '',
				description: 'New order of pages (e.g., "3,1,2" to put page 3 first, then page 1, then page 2)',
				displayOptions: {
					show: {
						operation: [Operation.Reorder],
					},
				},
				hint: 'Enter the new page order as comma-separated numbers',
			},
			{
				displayName: 'Page Target',
				name: 'pageTarget',
				type: 'string',
				default: 'all',
				description: 'Target pages (e.g., "1", "1,3-5", "all")',
				displayOptions: {
					show: {
						operation: [
							Operation.AddImage,
							Operation.Watermark,
							Operation.Delete,
							Operation.ExtractPages,
							Operation.Rotate,
							Operation.Split,
						],
					},
				},
			},
			{
				displayName: 'Watermark Text',
				name: 'watermarkText',
				type: 'string',
				default: '',
				description: 'Text to use as watermark',
				displayOptions: {
					show: {
						operation: [Operation.Watermark],
					},
				},
			},
			{
				displayName: 'Rotation Angle',
				name: 'rotationAngle',
				type: 'number',
				default: 90,
				description: 'Rotation angle in degrees (90, 180, 270)',
				displayOptions: {
					show: {
						operation: [Operation.Rotate],
					},
				},
			},
			{
				displayName: 'Image Options',
				name: 'imageOptions',
				type: 'collection',
				default: {},
				description: 'Options for image placement and scaling',
				displayOptions: {
					show: {
						operation: [Operation.AddImage],
					},
				},
				options: [
					{
						displayName: 'X Position',
						name: 'x',
						type: 'number',
						default: 50,
						description: 'X coordinate for image position',
					},
					{
						displayName: 'Y Position',
						name: 'y',
						type: 'number',
						default: 400,
						description: 'Y coordinate for image position',
					},
					{
						displayName: 'Scale',
						name: 'scale',
						type: 'number',
						default: 0.5,
						description: 'Image scale factor',
					},
				],
			},
			{
				displayName: 'Watermark Options',
				name: 'watermarkOptions',
				type: 'collection',
				default: {},
				description: 'Options for watermark styling',
				displayOptions: {
					show: {
						operation: [Operation.Watermark],
					},
				},
				options: [
					{
						displayName: 'Font Size',
						name: 'fontSize',
						type: 'number',
						default: 50,
						description: 'Font size for watermark text',
					},
					{
						displayName: 'Color',
						name: 'color',
						type: 'color',
						default: '#808080',
						description: 'Color of the watermark',
					},
					{
						displayName: 'Opacity',
						name: 'opacity',
						type: 'number',
						default: 0.3,
						description: 'Opacity of the watermark (0-1)',
					},
				],
			},
			{
				displayName: 'Pages',
				name: 'pages',
				type: 'string',
				default: 'all',
				description: 'Pages to extract, split, or rotate (e.g., "1", "1,3-5", "all")',
				displayOptions: {
					show: {
						operation: [
							Operation.Delete,
							Operation.ExtractPages,
							Operation.Rotate,
							Operation.Split,
						],
					},
				},
			},
		],
	};

	/**
	 * Main execution method for the node
	 * Processes each input item and performs the requested PDF operation
	 * Handles:
	 * - Input validation
	 * - Binary data processing
	 * - Operation execution
	 * - Error handling
	 * - Result formatting
	 * @param this - Execution context containing node parameters and utilities
	 * @returns Array of execution results containing modified PDFs or operation results
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[][] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as Operation;
				const binaryFields = this.getNodeParameter('binaryFields', i) as IBinaryKeyData;
				const options = this.getNodeParameter('options', i) as Record<string, any>;

				let result: Buffer | undefined;
				let pdfBinaryName = 'output';

				console.log(`Starting operation ${operation} on item ${i}`);

				switch (operation) {
					case Operation.AddImage: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const imageBinaryName = binaryFields.imageBinaryName?.imageBinaryName || 'image';
						const pageTarget = options.watermarkOptions?.pageTarget || 'all';

						console.log(`Processing AddImage with PDF: ${pdfBinaryName}, Image: ${imageBinaryName}, Target: ${pageTarget}`);

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						const imageBinary = items[i].binary?.[imageBinaryName];
						if (!imageBinary) {
							throw new Error(`No binary data found for ${imageBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);
						PdfOperations.ensureMimeType(imageBinary, ['image/png', 'image/jpeg']);

						const imageOptions = this.getNodeParameter('imageOptions.position', i) as {
							x: number;
							y: number;
							scale: number;
						};

						result = await PdfOperations.addImage(
							Buffer.from(pdfBinary.data, 'base64'),
							Buffer.from(imageBinary.data, 'base64'),
							imageBinary.mimeType,
							pageTarget,
							imageOptions,
						);
						break;
					}
					case Operation.Watermark: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const { watermarkText, pageTarget } = options.watermarkOptions || { watermarkText: '', pageTarget: 'all' };

						console.log(`Processing Watermark with PDF: ${pdfBinaryName}, Text: ${watermarkText}, Target: ${pageTarget}`);

						if (!watermarkText) {
							throw new NodeOperationError(this.getNode(), 'Le texte du filigrane est requis');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						const watermarkOptions = this.getNodeParameter('watermarkOptions.style', i) as {
							text: string;
							fontSize: number;
							color: string;
							opacity: number;
							x: number;
							y: number;
						};

						result = await PdfOperations.addWatermark(
							Buffer.from(pdfBinary.data, 'base64'),
							watermarkOptions.text,
							pageTarget,
							watermarkOptions,
						);
						break;
					}
					case Operation.Delete: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pages = options.pageOptions?.pages;

						console.log(`Processing Delete with PDF: ${pdfBinaryName}, Pages: ${pages}`);

						if (!pages) {
							throw new NodeOperationError(this.getNode(), 'Les pages à supprimer sont requises');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						result = await PdfOperations.deletePages(
							Buffer.from(pdfBinary.data, 'base64'),
							pages,
						);
						break;
					}
					case Operation.Merge: {
						const pdfBinaryNames = (binaryFields.pdfBinaryNames?.pdfBinaryNames || '').split(',').filter(Boolean);

						console.log(`Processing Merge with PDFs: ${pdfBinaryNames.join(', ')}`);

						if (pdfBinaryNames.length < 2) {
							throw new NodeOperationError(this.getNode(), 'Au moins deux fichiers PDF sont requis pour la fusion');
						}

						const pdfBuffers = await Promise.all(
							pdfBinaryNames.map(async (name) => {
								const binary = items[i].binary?.[name.trim()];
								if (!binary) {
									throw new Error(`No binary data found for ${name.trim()}`);
								}
								PdfOperations.ensureMimeType(binary, ['application/pdf']);
								return Buffer.from(binary.data, 'base64');
							}),
						);

						result = await PdfOperations.mergePDFs(pdfBuffers);
						break;
					}
					case Operation.ExtractPages: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pages = options.pageOptions?.pages;

						console.log(`Processing ExtractPages with PDF: ${pdfBinaryName}, Pages: ${pages}`);

						if (!pages) {
							throw new NodeOperationError(this.getNode(), 'Les pages à extraire sont requises');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						result = await PdfOperations.extractPages(
							Buffer.from(pdfBinary.data, 'base64'),
							pages,
						);
						break;
					}
					case Operation.Reorder: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const newPageOrder = this.getNodeParameter('newPageOrder', i) as string;

						console.log(`Processing Reorder with PDF: ${pdfBinaryName}, New Order: ${newPageOrder}`);

						if (!newPageOrder) {
							throw new NodeOperationError(this.getNode(), 'Le nouvel ordre des pages est requis');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						result = await PdfOperations.reorderPages(
							Buffer.from(pdfBinary.data, 'base64'),
							newPageOrder,
						);
						break;
					}
					case Operation.Rotate: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pages = options.pageOptions?.pages;
						const rotationAngle = this.getNodeParameter('rotationAngle', i) as number;

						console.log(`Processing Rotate with PDF: ${pdfBinaryName}, Pages: ${pages}, Angle: ${rotationAngle}`);

						if (!pages) {
							throw new NodeOperationError(this.getNode(), 'Les pages à rotation sont requises');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						result = await PdfOperations.rotatePages(
							Buffer.from(pdfBinary.data, 'base64'),
							pages,
							rotationAngle,
						);
						break;
					}
					case Operation.Split: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pages = options.pageOptions?.pages;

						console.log(`Processing Split with PDF: ${pdfBinaryName}, Pages: ${pages}`);

						if (!pages) {
							throw new NodeOperationError(this.getNode(), 'Les pages à extraire sont requises');
						}

						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						result = await PdfOperations.splitPDF(
							Buffer.from(pdfBinary.data, 'base64'),
							pages,
						);
						break;
					}
					case Operation.Metadata: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						console.log(`Processing Metadata with PDF: ${pdfBinaryName}`);

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						const metadata = await PdfOperations.readMetadata(Buffer.from(pdfBinary.data, 'base64'));
						returnData.push([{
							json: metadata,
						}]);
						continue;
					}
					case Operation.ExtractText: {
						const pdfBinaryName = binaryFields.pdfBinaryName?.pdfBinaryName || 'output';
						const pdfBinary = items[i].binary?.[pdfBinaryName];
						if (!pdfBinary) {
							throw new Error(`No binary data found for ${pdfBinaryName}`);
						}

						PdfOperations.ensureMimeType(pdfBinary, ['application/pdf']);

						const text = await PdfOperations.extractText(Buffer.from(pdfBinary.data, 'base64'));
						returnData.push([{
							json: {
								text,
							},
						}]);
						break;
					}
					default:
						throw new NodeOperationError(this.getNode(), `Opération non supportée: ${operation}`);
				}

				if (result) {
					console.log(`Operation ${operation} completed successfully`);
					returnData.push([{
						json: {},
						binary: {
							[pdfBinaryName]: {
								data: result.toString('base64'),
								fileName: `${pdfBinaryName}.pdf`,
								mimeType: 'application/pdf',
							},
						},
					}]);
				}
			} catch (error) {
				console.error(`Error in operation: ${error.message}`);
				throw error;
			}
		}

		return returnData;
	}

	/**
	 * Returns the node description in markdown format
	 * Provides comprehensive documentation for the node including:
	 * - Available operations
	 * - Required parameters
	 * - Usage examples
	 * - Supported formats
	 * @returns Markdown documentation string
	 */
	getDescription(): string {
		return `# PDF Tools Node

Ce nœud permet d'effectuer diverses opérations sur les fichiers PDF.

## Opérations disponibles

### Add Image
Ajoute une image à un PDF existant.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Image Binary Field**: Nom du champ binaire contenant l'image (PNG ou JPEG)
- **Pages**: Pages cibles (ex: "1", "1,3-5", "all")

### Add Watermark
Ajoute un filigrane textuel au PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Watermark Text**: Texte du filigrane
- **Pages**: Pages cibles (ex: "1", "1,3-5", "all")

### Delete Pages
Supprime des pages du PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à supprimer (ex: "1", "1,3-5", "all")

### Extract Pages
Extrait des pages spécifiques dans un nouveau PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à extraire (ex: "1", "1,3-5", "all")

### Merge PDFs
Fusionne plusieurs PDFs en un seul.
- **PDF Binary Field Names**: Liste des noms de champs binaires contenant les PDFs à fusionner (séparés par des virgules)

### Read Metadata
Lit les métadonnées d'un PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF

### Reorder Pages
Réorganise les pages d'un PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Nouvel ordre des pages (ex: "3,1,2")

### Rotate Pages
Fait pivoter des pages du PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à faire pivoter (ex: "1", "1,3-5", "all")
- **Rotation Angle**: Angle de rotation (90, 180, 270)

### Split PDF
Divise un PDF en plusieurs fichiers.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF
- **Pages**: Pages à extraire (ex: "1", "1,3-5", "all")

### Extract Text
Extrait le texte d'un PDF.
- **PDF Binary Field**: Nom du champ binaire contenant le PDF

## Formats supportés

- PDF: application/pdf
- Images: image/png, image/jpeg
`;
	}
}
