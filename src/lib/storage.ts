import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export type FileType = 'IMAGE' | 'PDF' | 'WORD' | 'AUDIO';

/**
 * Get the appropriate file extension based on the original filename
 */
function getFileExtension(originalFilename: string, fileType: FileType): string {
    const ext = originalFilename.split('.').pop()?.toLowerCase() || '';

    // Validate extension matches file type
    switch (fileType) {
        case 'IMAGE':
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                return ext;
            }
            return 'jpg'; // default
        case 'PDF':
            return 'pdf';
        case 'WORD':
            return ext === 'docx' ? 'docx' : 'doc';
        case 'AUDIO':
            if (['webm', 'mp3', 'ogg', 'm4a', 'wav'].includes(ext)) {
                return ext;
            }
            return 'webm'; // default for web recordings
        default:
            return 'bin';
    }
}

/**
 * Get the subdirectory name based on file type
 */
function getSubdirectory(fileType: FileType): string {
    switch (fileType) {
        case 'IMAGE':
            return 'images';
        case 'AUDIO':
            return 'audio';
        case 'PDF':
        case 'WORD':
            return 'documents';
        default:
            return 'attachments';
    }
}

/**
 * Saves file data to the local filesystem with a unique UUID name
 * @param fileData The file data as Buffer
 * @param originalFilename The original filename (for extension detection)
 * @param fileType The type of file being saved
 * @returns The public URL path to the saved file
 */
export async function saveFile(
    fileData: Buffer,
    originalFilename: string,
    fileType: FileType
): Promise<string> {
    try {
        // Get appropriate subdirectory
        const subdirectory = getSubdirectory(fileType);
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', subdirectory);

        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique filename with appropriate extension
        const extension = getFileExtension(originalFilename, fileType);
        const filename = `${uuidv4()}.${extension}`;
        const filePath = path.join(uploadDir, filename);

        // Write file data directly (no encryption)
        await fs.promises.writeFile(filePath, fileData);

        // Return public path
        return `/uploads/${subdirectory}/${filename}`;
    } catch (error) {
        console.error('Error saving file:', error);
        throw new Error('Failed to save attachment file');
    }
}

/**
 * Delete a file from the filesystem
 * @param publicPath The public path to the file (e.g., /uploads/images/xxx.jpg)
 */
export async function deleteFile(publicPath: string): Promise<void> {
    try {
        const filePath = path.join(process.cwd(), 'public', publicPath);

        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        // Don't throw - file deletion is not critical
    }
}

/**
 * Check if a file exists
 * @param publicPath The public path to the file
 */
export function fileExists(publicPath: string): boolean {
    try {
        const filePath = path.join(process.cwd(), 'public', publicPath);
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
}
