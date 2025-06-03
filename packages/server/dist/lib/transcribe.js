import fs from 'fs';
import { createClient } from '@deepgram/sdk';
// Deepgram client instance with proper typing
let dg = null;
/**
 * Get or create a Deepgram client instance
 * @returns {DeepgramClient} The Deepgram client
 * @throws {Error} If DEEPGRAM_API_KEY is not found
 */
function getDeepgramClient() {
    if (!dg) {
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
            throw new Error('DEEPGRAM_API_KEY not found.');
        }
        dg = createClient(apiKey);
    }
    return dg;
}
/**
 * Transcribe an audio file using Deepgram API
 * @param {string} filePath - Path to the audio file to transcribe
 * @returns {Promise<string>} The transcribed text
 * @throws {Error} If transcription fails
 */
export async function transcribe(filePath) {
    // Open a read-stream for the audio file
    const audioStream = fs.createReadStream(filePath);
    // Get Deepgram client
    const client = getDeepgramClient();
    // Use Deepgram SDK to transcribe
    try {
        const { result, error } = await client.listen.prerecorded.transcribeFile(audioStream, {
            model: 'nova-3',
            smart_format: true,
            punctuate: true
        });
        if (error) {
            throw error;
        }
        // Extract transcript from the result with proper null checking
        const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        if (!transcript) {
            throw new Error('Transcription failed: No transcript in result');
        }
        return transcript;
    }
    catch (error) {
        // Enhanced error handling with proper typing
        const errorMessage = error instanceof Error ? error.message : 'Unknown transcription error';
        console.error('[transcribe.ts:transcribe] Error during transcription:', errorMessage);
        throw error; // Re-throw the error to be caught by the caller
    }
}
