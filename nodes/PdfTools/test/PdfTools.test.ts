import { IExecuteFunctions } from 'n8n-core';
import { INodeExecutionData, INodeType, NodeOperationError } from 'n8n-workflow';
import { PdfTools } from '../PdfTools.node';
import { PDFDocument } from 'pdf-lib';

describe('PdfTools', () => {
	let node: PdfTools;
	let mockExecuteFunctions: IExecuteFunctions;

	beforeEach(() => {
		node = new PdfTools();
		mockExecuteFunctions = {
			getNodeParameter: jest.fn(),
			getInputData: jest.fn(),
			helpers: {
				assertBinaryData: jest.fn(),
			},
			continueOnFail: jest.fn(),
			logger: {
				debug: jest.fn(),
				error: jest.fn(),
			},
		} as unknown as IExecuteFunctions;
	});

	describe('addImage', () => {
		it('should add an image to a PDF', async () => {
			// Créer un PDF de test
			const pdfDoc = await PDFDocument.create();
			pdfDoc.addPage();
			const pdfBytes = await pdfDoc.save();
			const pdfBuffer = Buffer.from(pdfBytes);

			// Créer une image de test (1x1 pixel PNG)
			const imageBuffer = Buffer.from([
				0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
				0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
				0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
				0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x00, 0x00, 0x02,
				0x00, 0x01, 0x0D, 0x0D, 0x2D, 0x0E, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
				0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
			]);

			// Configurer les mocks
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				switch (paramName) {
					case 'operation':
						return 'addImage';
					case 'binaryFields.pdfBinaryName':
						return 'pdf';
					case 'binaryFields.imageBinaryName':
						return 'image';
					case 'options.watermarkOptions.pageTarget':
						return 'all';
					case 'imageOptions.position':
						return { x: 50, y: 400, scale: 0.5 };
					default:
						return undefined;
				}
			});

			(mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue([
				{
					binary: {
						pdf: {
							data: pdfBuffer.toString('base64'),
							mimeType: 'application/pdf',
							fileName: 'test.pdf',
						},
						image: {
							data: imageBuffer.toString('base64'),
							mimeType: 'image/png',
							fileName: 'test.png',
						},
					},
				},
			]);

			// Exécuter le nœud
			const result = await node.execute.call(mockExecuteFunctions);

			// Vérifier le résultat
			expect(result[0][0].binary).toBeDefined();
			expect(result[0][0].binary.output).toBeDefined();
			expect(result[0][0].binary.output.mimeType).toBe('application/pdf');
		});
	});

	describe('addWatermark', () => {
		it('should add a watermark to a PDF', async () => {
			// Créer un PDF de test
			const pdfDoc = await PDFDocument.create();
			pdfDoc.addPage();
			const pdfBytes = await pdfDoc.save();
			const pdfBuffer = Buffer.from(pdfBytes);

			// Configurer les mocks
			(mockExecuteFunctions.getNodeParameter as jest.Mock).mockImplementation((paramName: string) => {
				switch (paramName) {
					case 'operation':
						return 'watermark';
					case 'binaryFields.pdfBinaryName':
						return 'pdf';
					case 'watermarkOptions.style':
						return {
							text: 'Test Watermark',
							fontSize: 50,
							color: '#808080',
							opacity: 0.3,
							x: 0,
							y: 0,
						};
					case 'options.watermarkOptions.pageTarget':
						return 'all';
					default:
						return undefined;
				}
			});

			(mockExecuteFunctions.getInputData as jest.Mock).mockReturnValue([
				{
					binary: {
						pdf: {
							data: pdfBuffer.toString('base64'),
							mimeType: 'application/pdf',
							fileName: 'test.pdf',
						},
					},
				},
			]);

			// Exécuter le nœud
			const result = await node.execute.call(mockExecuteFunctions);

			// Vérifier le résultat
			expect(result[0][0].binary).toBeDefined();
			expect(result[0][0].binary.output).toBeDefined();
			expect(result[0][0].binary.output.mimeType).toBe('application/pdf');
		});
	});
});
