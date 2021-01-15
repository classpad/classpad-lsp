/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	Command
} from 'vscode-languageserver';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	let text = textDocument.getText();
	let pattern = /\b[A-Z]{2,}\b/g;
	let m: RegExpExecArray | null;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
		problems++;
		let diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: textDocument.positionAt(m.index),
				end: textDocument.positionAt(m.index + m[0].length)
			},
			message: `${m[0]} is all uppercase.`,
			source: 'ex'
		};
		if (hasDiagnosticRelatedInformationCapability) {
			diagnostic.relatedInformation = [
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Spelling matters'
				},
				{
					location: {
						uri: textDocument.uri,
						range: Object.assign({}, diagnostic.range)
					},
					message: 'Particularly for names'
				}
			];
		}
		diagnostics.push(diagnostic);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

const newKeyword = (keyword:string, word?:string) => {
	return { label: keyword, insertText: (word ? word : keyword), kind: CompletionItemKind.Keyword }
};
const newBackKeyword = (keyword:string) => {
	return {
		label: keyword,
		insertText: keyword,
		command: Command.create("outdent","editor.action.outdentLines"),
		kind: CompletionItemKind.Keyword
	}
};
const newVariable = (keyword:string, word?:string) => {
	return { label: keyword, insertText: (word ? word : keyword), kind: CompletionItemKind.Variable }
};
const newOperator = (keyword:string, word?:string) => {
	return { label: keyword, insertText: (word ? word : keyword), kind: CompletionItemKind.Operator }
};
const newFunction = (keyword:string) => {
	return { label: keyword, insertText: keyword, kind: CompletionItemKind.Function }
};
// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'diff',
				kind: CompletionItemKind.Function,
				data: 1,
				detail: 'diff',
				documentation: 'diff(Exp/List, variable, order [,a])',
				insertText: 'diff(f(x), x, 1)',
			},
			{
				label: 'impDiff',
				kind: CompletionItemKind.Function,
				data: 1,
				detail: 'impDiff',
				documentation: 'impDiff(Eq/Exp/List, independent variable, dependent variable)',
				insertText: 'impDiff(f(x), x, y)',
			},
			{
				label: 'integrate',
				kind: CompletionItemKind.Function,
				data: 1,
				detail: '∫',
				documentation: '∫(Exp/List, variable, lower limit, upper limit [,toL])',
				insertText: '∫(f(x),x,L,U)',
			},
			{
				label: 'lim',
				kind: CompletionItemKind.Function,
				data: 1,
				detail: 'lim',
				documentation: 'lim(Exp/List, variable, point [,direction])',
				insertText: 'lim(f(x), x, ∞)',
			},
			{
				label: 'sqrt',
				kind: CompletionItemKind.Function,
				data: 1,
				detail: '√()',
				insertText: '√()',
			},

			{
				label: 'If',
				kind: CompletionItemKind.Snippet,
				data: 1,
				detail: 'If (condition) : Then ... IfEnd',
				documentation: 'If (condition) : Then\n\t[...]\nIfEnd',
				insertText: 'If () : Then\n\t\nIfEnd',
			},
			{
				label: 'IfElse',
				kind: CompletionItemKind.Snippet,
				data: 2,
				detail: 'If (condition) : Then ... Else ... IfEnd',
				documentation: 'If (condition) : Then\n\t[...]\nElse\n\t[...]\nIfEnd',
				insertText: 'If () : Then\n\t\nElse\n\t\nIfEnd',
			},
			newKeyword('If'),
			newKeyword('Then'),

			newBackKeyword('IfEnd'),
			newBackKeyword('Else'),
			newBackKeyword('ElseIf'),

			newOperator('NotEqual','≠'),
			newOperator('LessEqual','≤'),
			newOperator('GreaterEqual','≥'),
			newOperator('Assign','⇒'),

			newOperator('and',' and '),
			newOperator('or',' or '),
			newOperator('not',' not '),

			newKeyword('Skip'),
			newKeyword('Return'),
			newKeyword('Break'),
			newKeyword('Stop'),
			newKeyword('Pause'),
			newKeyword('Wait'),

			newFunction('Print '),
			newFunction('PrintNatural '),
			newFunction('Message '),
			newFunction('DelVar '),
			
			newFunction('Cls'),

			newFunction('ColorBlack'),
			newFunction('ColorBlue'),
			newFunction('ColorRed'),
			newFunction('ColorMagenta'),
			newFunction('ColorGreen'),
			newFunction('ColorCyan'),
			newFunction('ColorYellow'),
			
			newKeyword('For'),
			newKeyword('To'),
			newKeyword('Step'),

			newBackKeyword('Next'),
			{
				label: 'For',
				kind: CompletionItemKind.Snippet,
				data: 2,
				detail: 'For L⇒x To U Step Δ ... Next',
				documentation: 'For L⇒x To U Step Δ\n\t[...]\nNext',
				insertText: 'For L⇒x To U Step Δ\n\t\nNext'
			},

			newVariable('Alpha','Α'), 	newVariable('alpha','α'),
			newVariable('Beta','Β'),	newVariable('beta','β'),
			newVariable('Gamma','Γ'),	newVariable('gamma','γ'),
			newVariable('Delta','Δ'),	newVariable('delta','δ'),
			newVariable('Epsilon','Ε'),	newVariable('epsilon','ε'),
			newVariable('Zeta','Ζ'),	newVariable('zeta','ζ'),
			newVariable('Eta','Η'),		newVariable('eta','η'),
			newVariable('Theta','Θ'),	newVariable('theta','θ'),
			newVariable('Iota','Ι'),	newVariable('iota','ι'),
			newVariable('Kappa','Κ'),	newVariable('kappa','κ'),
			newVariable('Lambda','Λ'), 	newVariable('lambda','λ'),
			newVariable('Mu','Μ'),		newVariable('mu','μ'),
			newVariable('Nu','Ν'),		newVariable('nu','ν'),
			newVariable('Xi','Ξ'),		newVariable('xi','ξ'),
			newVariable('Omicron','Ο'),	newVariable('omicron','ο'),
			newVariable('Pi','Π'),		newVariable('pi','π'),
			newVariable('Rho','Ρ'),		newVariable('rho','ρ'),
			newVariable('Sigma','Σ'),	newVariable('sigma','σ'), 	newVariable('sigma','ς'),
			newVariable('Tau','Τ'),		newVariable('tau','τ'),
			newVariable('Upsilon','Υ'),	newVariable('upsilon','υ'),
			newVariable('Phi','Φ'),		newVariable('phi','φ'),
			newVariable('Chi','Χ'),		newVariable('chi','χ'),
			newVariable('Psi','Ψ'),		newVariable('psi','ψ'),
			newVariable('Omega','Ω'),	newVariable('omega','ω'),
			
			newVariable('infinity','∞')
		];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		// if (item.data === 1) {
		// }
		return item;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
