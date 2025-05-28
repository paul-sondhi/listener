// lib/transcribe.js
import fs from 'fs';
import { createClient } from '@deepgram/sdk';

// Initialize Deepgram client lazily
let dg = null;

function getDeepgramClient() {
    if (!dg) {
        dg = createClient(process.env.DEEPGRAM_API_KEY);
    }
    return dg;
}

async function transcribe(filePath) {
    // Open a read-stream for the audio file
    const audioStream = fs.createReadStream(filePath);

    // Get Deepgram client
    const client = getDeepgramClient();

    // Send the audio to Deepgram
    const { result, error } = await client.listen.prerecorded.transcribeFile(
        audioStream,                               // audio under key `stream`
        {                                          // transcription options
            model: 'nova-3',
            smart_format: true,
            punctuate: true
        }
    );

    // Handle any API error
    if (error) throw error;

    // Extract and return the transcript text
    return result.results.channels[0].alternatives[0].transcript;
}

export { transcribe };