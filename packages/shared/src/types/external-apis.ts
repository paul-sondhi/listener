/**
 * Type definitions for external APIs used by the application
 * Includes PodcastIndex, iTunes, and other third-party services
 */

// PodcastIndex API Types
export interface PodcastIndexSearchResponse {
  status: 'true' | 'false'
  feeds: PodcastIndexFeed[]
  count: number
  query: string
  description: string
}

export interface PodcastIndexFeed {
  id: number
  title: string
  url: string
  originalUrl: string
  link: string
  description: string
  author: string
  ownerName: string
  image: string
  artwork: string
  lastUpdateTime: number
  lastCrawlTime: number
  lastParseTime: number
  inPollingQueue: number
  priority: number
  lastGoodHttpStatusTime: number
  lastHttpStatus: number
  contentType: string
  itunesId?: number
  itunesType?: string
  generator?: string
  language: string
  explicit: boolean
  type: number
  dead: number
  crawlErrors: number
  parseErrors: number
  categories: { [key: string]: string }
  locked: number
  imageUrlHash: number
}

// iTunes API Types  
export interface iTunesSearchResponse {
  resultCount: number
  results: iTunesResult[]
}

export interface iTunesResult {
  wrapperType: 'track' | 'collection' | 'artist'
  kind: 'podcast' | 'podcast-episode'
  collectionId?: number
  trackId?: number
  artistName?: string
  collectionName?: string
  trackName?: string
  collectionCensoredName?: string
  trackCensoredName?: string
  collectionViewUrl?: string
  feedUrl?: string
  trackViewUrl?: string
  artworkUrl30?: string
  artworkUrl60?: string
  artworkUrl100?: string
  artworkUrl600?: string
  collectionPrice?: number
  trackPrice?: number
  releaseDate?: string
  collectionExplicitness?: 'explicit' | 'cleaned' | 'notExplicit'
  trackExplicitness?: 'explicit' | 'cleaned' | 'notExplicit'
  trackCount?: number
  trackTimeMillis?: number
  country: string
  currency?: string
  primaryGenreName?: string
  contentAdvisoryRating?: string
  genreIds?: string[]
  genres?: string[]
}

// RSS Feed Types
export interface RSSFeed {
  title: string
  description: string
  link: string
  language?: string
  copyright?: string
  managingEditor?: string
  webMaster?: string
  pubDate?: string
  lastBuildDate?: string
  category?: string[]
  generator?: string
  docs?: string
  cloud?: RSSCloud
  ttl?: number
  image?: RSSImage
  rating?: string
  textInput?: RSSTextInput
  skipHours?: number[]
  skipDays?: string[]
  items: RSSItem[]
}

export interface RSSItem {
  title?: string
  link?: string
  description?: string
  author?: string
  category?: string[]
  comments?: string
  enclosure?: RSSEnclosure
  guid?: string | { value: string; isPermaLink: boolean }
  pubDate?: string
  source?: string
  'content:encoded'?: string
  'itunes:title'?: string
  'itunes:subtitle'?: string
  'itunes:summary'?: string
  'itunes:duration'?: string
  'itunes:explicit'?: string
  'itunes:episode'?: string
  'itunes:season'?: string
  'itunes:episodeType'?: 'full' | 'trailer' | 'bonus'
  'itunes:author'?: string
  'itunes:image'?: { href: string }
}

export interface RSSEnclosure {
  url: string
  length: string
  type: string
}

export interface RSSImage {
  url: string
  title: string
  link: string
  width?: number
  height?: number
  description?: string
}

export interface RSSCloud {
  domain: string
  port: number
  path: string
  registerProcedure: string
  protocol: string
}

export interface RSSTextInput {
  title: string
  description: string
  name: string
  link: string
}

// Deepgram API Types
export interface DeepgramConfig {
  model: string
  smart_format: boolean
  punctuate: boolean
  diarize: boolean
  utterances: boolean
  language?: string
  encoding?: string
  sample_rate?: number
  channels?: number
}

export interface DeepgramTranscriptionResult {
  metadata: DeepgramMetadata
  results: {
    channels: DeepgramChannel[]
    utterances?: DeepgramUtterance[]
  }
}

export interface DeepgramMetadata {
  transaction_key: string
  request_id: string
  sha256: string
  created: string
  duration: number
  channels: number
  models: string[]
  model_info: { [key: string]: DeepgramModelInfo }
}

export interface DeepgramModelInfo {
  name: string
  canonical_name: string
  architecture: string
  languages?: string[]
  version: string
  uuid: string
  batch: boolean
  streaming: boolean
}

export interface DeepgramChannel {
  alternatives: DeepgramAlternative[]
}

export interface DeepgramAlternative {
  transcript: string
  confidence: number
  words: DeepgramWord[]
  paragraphs?: {
    transcript: string
    paragraphs: DeepgramParagraph[]
  }
}

export interface DeepgramWord {
  word: string
  start: number
  end: number
  confidence: number
  punctuated_word?: string
  speaker?: number
}

export interface DeepgramParagraph {
  sentences: DeepgramSentence[]
  start: number
  end: number
  num_words: number
}

export interface DeepgramSentence {
  text: string
  start: number
  end: number
}

export interface DeepgramUtterance {
  start: number
  end: number
  confidence: number
  channel: number
  transcript: string
  words: DeepgramWord[]
  speaker: number
}

// HTTP Stream Types
export interface StreamConfig {
  highWaterMark?: number
  encoding?: BufferEncoding
  objectMode?: boolean
  emitClose?: boolean
  autoDestroy?: boolean
  signal?: AbortSignal
}

// Error Types for External APIs
export interface ExternalApiError extends Error {
  status?: number
  statusCode?: number
  code?: string
  response?: {
    status: number
    statusText: string
    data?: unknown
  }
}

export interface PodcastIndexError extends ExternalApiError {
  service: 'podcastindex'
  endpoint?: string
}

export interface iTunesError extends ExternalApiError {
  service: 'itunes'
  term?: string
}

export interface DeepgramError extends ExternalApiError {
  service: 'deepgram'
  requestId?: string
}

export interface RSSParsingError extends ExternalApiError {
  service: 'rss'
  feedUrl?: string
} 