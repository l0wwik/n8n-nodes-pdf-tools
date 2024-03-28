import { IExecuteFunctions } from 'n8n-core';
import {
	INodeExecutionData,
	INodeProperties,
	INodeType,
	IBinaryKeyData,
	IBinaryData,
	INodeTypeDescription,
	IPairedItemData,
	NodeOperationError,
} from 'n8n-workflow';
import { BINARY_ENCODING } from 'n8n-workflow';
import { isPDFDocument, mergePdfs } from './PdfMergeUtils';

const nodeOperationOptions: INodeProperties[] = [
	{
		displayName: 'Property Name 1',
		name: 'dataPropertyName1',
		type: 'string',
		default: 'data',
		description:
			'Name of the binary property for the first input which holds the document to be used',
	},
	{
		displayName: 'Property Name 2',
		name: 'dataPropertyName2',
		type: 'string',
		default: 'data',
		description:
			'Name of the binary property for the second input which holds the document to be used',
	},
	{
		displayName: 'Property Name Out',
		name: 'dataPropertyNameOut',
		type: 'string',
		default: 'data',
		description: 'Name of the binary property where the combined document will be output',
	},
];

export class PdfMerge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Merge PDF',
		name: 'pdfMerge',
		icon: 'file:merge.svg',
		group: ['transform'],
		version: 1,
		description: 'Merges two PDF documents',
		defaults: {
			name: 'Merge PDF',
		},
		inputs: ['main', 'main'],
		inputNames: ['Document 1', 'Document 2'],
		outputs: ['main'],
		properties: [...nodeOperationOptions],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items1 = this.getInputData(0);
		const items2 = this.getInputData(1);
		let itemBinaryData1: IBinaryKeyData;
		let itemBinaryData2: IBinaryKeyData;
		let docBinaryDataF: IBinaryData;
		let docBinaryDataS: IBinaryData;

		if (items1.length !== items2.length) {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid inut lengths! Both inputs should have the same number of items, but had ${items1.length} and ${items2.length} items, respectively.`,
			);
		}

		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items1.length; itemIndex++) {
			const dataPropertyName1 = this.getNodeParameter('dataPropertyName1', itemIndex) as string;
			const dataPropertyName2 = this.getNodeParameter('dataPropertyName2', itemIndex) as string;
			const dataPropertyNameOut = this.getNodeParameter('dataPropertyNameOut', itemIndex) as string;
			const item1 = items1[itemIndex];
			const item2 = items2[itemIndex];

			try {
				itemBinaryData1 = items1[itemIndex].binary as IBinaryKeyData;
				itemBinaryData2 = items2[itemIndex].binary as IBinaryKeyData;
				docBinaryDataF = itemBinaryData1[dataPropertyName1] as IBinaryData;
				docBinaryDataS = itemBinaryData2[dataPropertyName2] as IBinaryData;

				if (!isPDFDocument(docBinaryDataF)) {
					// Sanity check: only allow PDFs
					throw new NodeOperationError(
						this.getNode(),
						`Input 1 (on binary property "${dataPropertyName1}") should be a PDF file, was ${docBinaryDataF.mimeType} instead`,
						{ itemIndex },
					);
				}
				if (!isPDFDocument(docBinaryDataS)) {
					// Sanity check: only allow PDFs
					throw new NodeOperationError(
						this.getNode(),
						`Input 2 (on binary property "${dataPropertyName2}") should be a PDF file, was ${docBinaryDataS.mimeType} instead`,
						{ itemIndex },
					);
				}
				let fileContent1: Buffer;
				if (docBinaryDataF.id) {
					fileContent1 = await this.helpers.binaryToBuffer(
						this.helpers.getBinaryStream(docBinaryDataF.id),
					);
				} else {
					fileContent1 = Buffer.from(docBinaryDataF.data, BINARY_ENCODING);
				}
				let fileContent2: Buffer;
				if (docBinaryDataS.id) {
					fileContent2 = await this.helpers.binaryToBuffer(
						this.helpers.getBinaryStream(docBinaryDataS.id),
					);
				} else {
					fileContent2 = Buffer.from(docBinaryDataS.data, BINARY_ENCODING);
				}

				const merged = await mergePdfs(fileContent1, fileContent2);

				// Add the rendered file in a new property
				returnData.push({
					json: {
						...item1.json,
						...item2.json,
					},
					binary: {
						...item1.binary,
						...item2.binary,
						[dataPropertyNameOut]: await this.helpers.prepareBinaryData(
							merged,
							dataPropertyNameOut + '.pdf',
							'application/pdf',
						),
					},
					pairedItem: [item1.pairedItem as IPairedItemData, item2.pairedItem as IPairedItemData],
				});
			} catch (error) {
				if (this.continueOnFail()) {
					// Carry on with the data that was provided as input (short-circuit the node)
					returnData.push({
						json: {
							...item1.json,
							...item2.json,
						},
						binary: {
							...item1.binary,
							...item2.binary,
						},
						pairedItem: [item1.pairedItem as IPairedItemData, item2.pairedItem as IPairedItemData],
					});
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
