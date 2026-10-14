/**
 * baseCourseMigration.ts — Lee los cursos base de una migración SQL que usa
 * $title$, $desc$ y $course$ como delimitadores, para validarlos sin base de datos.
 */
export interface BaseCourseFromMigration {
    title: string;
    description: string;
    content: string;
}

export function readBaseCoursesFromMigration(sql: string): BaseCourseFromMigration[] {
    const grab = (tag: string) => [...sql.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'g'))].map(match => match[1]);
    const titles = grab('title');
    const descriptions = grab('desc');
    const contents = grab('course');
    if (titles.length !== descriptions.length || titles.length !== contents.length) {
        throw new Error('La migración no tiene el mismo número de títulos, descripciones y contenidos.');
    }
    return titles.map((title, index) => ({ title, description: descriptions[index], content: contents[index] }));
}
