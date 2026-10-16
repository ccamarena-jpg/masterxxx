// Optional class code (Vercel env CLASS_CODE; SYLLABUS_UPLOAD_CODE is still accepted).
// When set it is required to replace syllabi, analyse them and delete activities.
export const classCode = () => process.env.CLASS_CODE || process.env.SYLLABUS_UPLOAD_CODE || '';
export const codeOk = (given: unknown) => { const c = classCode(); return !c || given === c; };
