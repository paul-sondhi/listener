import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: string; output: string; }
  JSON: { input: any; output: any; }
};

export type TaddyPodcastEpisode = {
  __typename?: 'PodcastEpisode';
  audioUrl?: Maybe<Scalars['String']['output']>;
  datePublished?: Maybe<Scalars['DateTime']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  guid: Scalars['String']['output'];
  name: Scalars['String']['output'];
  podcastSeries?: Maybe<TaddyPodcastSeries>;
  transcripts?: Maybe<Array<TaddyTranscript>>;
  uuid: Scalars['String']['output'];
};

export type TaddyPodcastSeries = {
  __typename?: 'PodcastSeries';
  description?: Maybe<Scalars['String']['output']>;
  episodes?: Maybe<Array<TaddyPodcastEpisode>>;
  itunesId?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  podcastGuid?: Maybe<Scalars['String']['output']>;
  rssUrl?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['String']['output'];
};

export type TaddyQuery = {
  __typename?: 'Query';
  getPodcastEpisode?: Maybe<TaddyPodcastEpisode>;
  getPodcastSeries?: Maybe<TaddyPodcastSeries>;
};


export type TaddyQueryGetPodcastEpisodeArgs = {
  episodeGuid?: InputMaybe<Scalars['String']['input']>;
  podcastGuid?: InputMaybe<Scalars['String']['input']>;
  podcastName?: InputMaybe<Scalars['String']['input']>;
};


export type TaddyQueryGetPodcastSeriesArgs = {
  iTunesId?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  podcastGuid?: InputMaybe<Scalars['String']['input']>;
};

export type TaddyTranscript = {
  __typename?: 'Transcript';
  createdAt: Scalars['DateTime']['output'];
  isPartial: Scalars['Boolean']['output'];
  language?: Maybe<Scalars['String']['output']>;
  percentComplete?: Maybe<Scalars['Float']['output']>;
  text: Scalars['String']['output'];
  uuid: Scalars['String']['output'];
  wordCount?: Maybe<Scalars['Int']['output']>;
};



export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {

  };
}
export type Sdk = ReturnType<typeof getSdk>;