export const PROJECT_CHARTER_ACCEPT = '.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel'

const PROJECT_CHARTER_EXTENSIONS = ['.xlsx', '.xlsm', '.xls']

export function isProjectCharterFile(file: File) {
  const name = file.name.toLowerCase()
  return PROJECT_CHARTER_EXTENSIONS.some(extension => name.endsWith(extension))
}

export function allProjectCharterFiles(files: File[]) {
  return files.every(isProjectCharterFile)
}
