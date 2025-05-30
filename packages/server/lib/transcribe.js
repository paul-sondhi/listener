// lib/transcribe.js
import fs from 'fs';
import { createClient } from '@deepgram/sdk';

let dg = null;

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

export async function transcribe(filePath) {
    // Open a read-stream for the audio file
    const audioStream = fs.createReadStream(filePath);

    // Get Deepgram client
    const client = getDeepgramClient();

    // Use Deepgram SDK to transcribe
    try {
        const { result, error } = await client.listen.prerecorded.transcribeFile(
            audioStream, 
            { model: 'nova-3', smart_format: true, punctuate: true }
        );
        if (error) throw error;
        if (result && result.results && result.results.channels && result.results.channels[0] && result.results.channels[0].alternatives && result.results.channels[0].alternatives[0]) {
            return result.results.channels[0].alternatives[0].transcript;
        }
        throw new Error('Transcription failed: No transcript in result');
    } catch (err) {
        // console.error('[transcribe.js:transcribe] Error during transcription:', err); // Keep this commented out or remove
        throw err; // Re-throw the error to be caught by the caller
    }
}