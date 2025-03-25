import { PDFDocument } from 'pdf-lib';
import { IExecuteFunctions } from 'n8n-workflow';
import { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

export class SplitPdf implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Split PDF',
    name: 'splitPdf',
    group: ['transform'],
    version: 1,
    description: 'Split a PDF into individual pages',
    defaults: {
      name: 'Split PDF',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of the binary property containing the PDF file',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnItems: INodeExecutionData[] = [];

    const binaryPropertyName = this.getNodeParameter('binaryPropertyName', 0) as string;

    const pdfBuffer = Buffer.from(items[0].binary![binaryPropertyName].data, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const numPages = pdfDoc.getPageCount();

    for (let i = 0; i < numPages; i++) {
      const newPdf = await PDFDocument.create();
      const [page] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(page);
      const newPdfBytes = await newPdf.save();

      const binary = await this.helpers.prepareBinaryData(
        Buffer.from(newPdfBytes),
        `page-${i + 1}.pdf`,
        'application/pdf',
      );

      returnItems.push({
        binary: {
          [binaryPropertyName]: binary,
        },
        json: {},
      });
    }

    return [returnItems];
  }
}
