export const PROJECT_CHARTER_ACCEPT = '.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel'
export const SOURCE_DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.csv,.xlsx,.xlsm,.xls,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel'

const PROJECT_CHARTER_EXTENSIONS = ['.xlsx', '.xlsm', '.xls']
const SOURCE_DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.xlsx', '.xlsm', '.xls']

export function isProjectCharterFile(file: File) {
  const name = file.name.toLowerCase()
  return PROJECT_CHARTER_EXTENSIONS.some(extension => name.endsWith(extension))
}

export function allProjectCharterFiles(files: File[]) {
  return files.every(isProjectCharterFile)
}

export function isSupportedSourceDocument(file: File) {
  const name = file.name.toLowerCase()
  return SOURCE_DOCUMENT_EXTENSIONS.some(extension => name.endsWith(extension))
}

export function allSupportedSourceDocuments(files: File[]) {
  return files.every(isSupportedSourceDocument)
}
