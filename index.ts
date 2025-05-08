import { IExecuteFunctions } from 'n8n-core';
import { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { PdfTools } from './nodes/PdfTools/PdfTools.node';

export const nodes: INodeType[] = [new PdfTools()];

export const credentials: any[] = [];
