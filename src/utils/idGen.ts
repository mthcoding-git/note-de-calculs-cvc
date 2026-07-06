let _uid = 0
export const uid = (prefix = 'x') => `${prefix}-${Date.now()}-${++_uid}`
