// lib/transcribe.js
const fs = require('fs');
const { createClient } = require('@deepgram/sdk');

// Create Deepgram client with your API key
const dg = createClient(process.env.DEEPGRAM_API_KEY);

async function transcribe(filePath) {
  // Open a read-stream for the audio file
  const audioStream = fs.createReadStream(filePath);

  // Send the audio to Deepgram
  const { result, error } = await dg.listen.prerecorded.transcribeFile(
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

module.exports = { transcribe };