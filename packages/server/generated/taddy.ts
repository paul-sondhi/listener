import { GraphQLClient } from 'graphql-request';
export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type TaddyChapter = {
  __typename?: 'Chapter';
  id?: Maybe<Scalars['ID']['output']>;
  startTimecode?: Maybe<Scalars['Int']['output']>;
  title?: Maybe<Scalars['String']['output']>;
};

export type TaddyChapterLink = {
  __typename?: 'ChapterLink';
  isTaddyExclusive?: Maybe<Scalars['Boolean']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type TaddyComicIssue = {
  __typename?: 'ComicIssue';
  bannerImageAsString?: Maybe<Scalars['String']['output']>;
  bannerImageUrl?: Maybe<Scalars['String']['output']>;
  comicSeries?: Maybe<TaddyComicSeries>;
  creatorNote?: Maybe<Scalars['String']['output']>;
  dateExclusiveContentIsAvailable?: Maybe<Scalars['Int']['output']>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  hash?: Maybe<Scalars['String']['output']>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  isRemoved?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  pushNotificationMessage?: Maybe<Scalars['String']['output']>;
  scopesForExclusiveContent?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  seriesUuid?: Maybe<Scalars['ID']['output']>;
  stories?: Maybe<Array<Maybe<TaddyComicStory>>>;
  storiesHash?: Maybe<Scalars['String']['output']>;
  storyImageUrls?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  thumbnailImageAsString?: Maybe<Scalars['String']['output']>;
  thumbnailImageUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyComicSeries = {
  __typename?: 'ComicSeries';
  bannerImageAsString?: Maybe<Scalars['String']['output']>;
  bannerImageUrl?: Maybe<Scalars['String']['output']>;
  contentRating?: Maybe<TaddyContentRating>;
  copyright?: Maybe<Scalars['String']['output']>;
  coverImageAsString?: Maybe<Scalars['String']['output']>;
  coverImageUrl?: Maybe<Scalars['String']['output']>;
  creators?: Maybe<Array<Maybe<TaddyCreator>>>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  feedRefreshDetails?: Maybe<TaddyFeedRefreshDetails>;
  genres?: Maybe<Array<Maybe<TaddyGenre>>>;
  hash?: Maybe<Scalars['String']['output']>;
  hostingProvider?: Maybe<TaddyHostingProvider>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  isCompleted?: Maybe<Scalars['Boolean']['output']>;
  issues?: Maybe<Array<Maybe<TaddyComicIssue>>>;
  issuesHash?: Maybe<Scalars['String']['output']>;
  language?: Maybe<TaddyLanguage>;
  name?: Maybe<Scalars['String']['output']>;
  scopesForExclusiveContent?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  seriesLayout?: Maybe<TaddyComicSeriesLayout>;
  seriesType?: Maybe<TaddyComicSeriesType>;
  sssOwnerName?: Maybe<Scalars['String']['output']>;
  sssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  sssUrl?: Maybe<Scalars['String']['output']>;
  status?: Maybe<TaddySeriesStatus>;
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  thumbnailImageAsString?: Maybe<Scalars['String']['output']>;
  thumbnailImageUrl?: Maybe<Scalars['String']['output']>;
  totalIssuesCount?: Maybe<Scalars['Int']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyComicSeriesLayout {
  LeftToRight = 'LEFT_TO_RIGHT',
  Page = 'PAGE',
  RightToLeft = 'RIGHT_TO_LEFT',
  VerticalScrollTopToBottom = 'VERTICAL_SCROLL_TOP_TO_BOTTOM'
}

export enum TaddyComicSeriesType {
  AmericanStyleComic = 'AMERICAN_STYLE_COMIC',
  Anthology = 'ANTHOLOGY',
  GraphicNovel = 'GRAPHIC_NOVEL',
  Manga = 'MANGA',
  Manhua = 'MANHUA',
  Manhwa = 'MANHWA',
  OneShot = 'ONE_SHOT',
  Webtoon = 'WEBTOON'
}

export type TaddyComicStory = {
  __typename?: 'ComicStory';
  comicIssue?: Maybe<TaddyComicIssue>;
  comicSeries?: Maybe<TaddyComicSeries>;
  hash?: Maybe<Scalars['String']['output']>;
  isRemoved?: Maybe<Scalars['Boolean']['output']>;
  issueUuid?: Maybe<Scalars['ID']['output']>;
  seriesUuid?: Maybe<Scalars['ID']['output']>;
  storyImageAsString?: Maybe<Scalars['String']['output']>;
  storyImageUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyContentInternalSeriesList = {
  __typename?: 'ContentInternalSeriesList';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  internalcomicseries?: Maybe<Array<Maybe<TaddyInternalComicSeries>>>;
  internalcreators?: Maybe<Array<Maybe<TaddyInternalCreator>>>;
};

export enum TaddyContentRating {
  ComicseriesAdults = 'COMICSERIES_ADULTS',
  ComicseriesBaby = 'COMICSERIES_BABY',
  ComicseriesErotica = 'COMICSERIES_EROTICA',
  ComicseriesKids = 'COMICSERIES_KIDS',
  ComicseriesMatureTeens = 'COMICSERIES_MATURE_TEENS',
  ComicseriesPornography = 'COMICSERIES_PORNOGRAPHY',
  ComicseriesTeens = 'COMICSERIES_TEENS'
}

export enum TaddyContentRole {
  ComicseriesArtist = 'COMICSERIES_ARTIST',
  ComicseriesArtistColorist = 'COMICSERIES_ARTIST_COLORIST',
  ComicseriesArtistInker = 'COMICSERIES_ARTIST_INKER',
  ComicseriesArtistLetterer = 'COMICSERIES_ARTIST_LETTERER',
  ComicseriesArtistPenciler = 'COMICSERIES_ARTIST_PENCILER',
  ComicseriesEditor = 'COMICSERIES_EDITOR',
  ComicseriesProducer = 'COMICSERIES_PRODUCER',
  ComicseriesTranslator = 'COMICSERIES_TRANSLATOR',
  ComicseriesWriter = 'COMICSERIES_WRITER',
  PodcastseriesAnnouncer = 'PODCASTSERIES_ANNOUNCER',
  PodcastseriesAssistantCamera = 'PODCASTSERIES_ASSISTANT_CAMERA',
  PodcastseriesAssistantDirector = 'PODCASTSERIES_ASSISTANT_DIRECTOR',
  PodcastseriesAssistantEditor = 'PODCASTSERIES_ASSISTANT_EDITOR',
  PodcastseriesAssociateProducer = 'PODCASTSERIES_ASSOCIATE_PRODUCER',
  PodcastseriesAudioEditor = 'PODCASTSERIES_AUDIO_EDITOR',
  PodcastseriesAudioEngineer = 'PODCASTSERIES_AUDIO_ENGINEER',
  PodcastseriesAuthor = 'PODCASTSERIES_AUTHOR',
  PodcastseriesBookingCoordinator = 'PODCASTSERIES_BOOKING_COORDINATOR',
  PodcastseriesCameraGrip = 'PODCASTSERIES_CAMERA_GRIP',
  PodcastseriesCameraOperator = 'PODCASTSERIES_CAMERA_OPERATOR',
  PodcastseriesComposer = 'PODCASTSERIES_COMPOSER',
  PodcastseriesContentManager = 'PODCASTSERIES_CONTENT_MANAGER',
  PodcastseriesCoverArtDesigner = 'PODCASTSERIES_COVER_ART_DESIGNER',
  PodcastseriesCoHost = 'PODCASTSERIES_CO_HOST',
  PodcastseriesCoWriter = 'PODCASTSERIES_CO_WRITER',
  PodcastseriesCreativeDirector = 'PODCASTSERIES_CREATIVE_DIRECTOR',
  PodcastseriesDevelopmentProducer = 'PODCASTSERIES_DEVELOPMENT_PRODUCER',
  PodcastseriesDirector = 'PODCASTSERIES_DIRECTOR',
  PodcastseriesEditor = 'PODCASTSERIES_EDITOR',
  PodcastseriesEditorialDirector = 'PODCASTSERIES_EDITORIAL_DIRECTOR',
  PodcastseriesExecutiveProducer = 'PODCASTSERIES_EXECUTIVE_PRODUCER',
  PodcastseriesFactChecker = 'PODCASTSERIES_FACT_CHECKER',
  PodcastseriesFoleyArtist = 'PODCASTSERIES_FOLEY_ARTIST',
  PodcastseriesGraphicDesigner = 'PODCASTSERIES_GRAPHIC_DESIGNER',
  PodcastseriesGuest = 'PODCASTSERIES_GUEST',
  PodcastseriesGuestHost = 'PODCASTSERIES_GUEST_HOST',
  PodcastseriesGuestWriter = 'PODCASTSERIES_GUEST_WRITER',
  PodcastseriesHost = 'PODCASTSERIES_HOST',
  PodcastseriesLightingDesigner = 'PODCASTSERIES_LIGHTING_DESIGNER',
  PodcastseriesLogger = 'PODCASTSERIES_LOGGER',
  PodcastseriesManagingEditor = 'PODCASTSERIES_MANAGING_EDITOR',
  PodcastseriesMarketingManager = 'PODCASTSERIES_MARKETING_MANAGER',
  PodcastseriesMiscConsultant = 'PODCASTSERIES_MISC_CONSULTANT',
  PodcastseriesMiscIntern = 'PODCASTSERIES_MISC_INTERN',
  PodcastseriesMusicContributor = 'PODCASTSERIES_MUSIC_CONTRIBUTOR',
  PodcastseriesMusicProduction = 'PODCASTSERIES_MUSIC_PRODUCTION',
  PodcastseriesNarrator = 'PODCASTSERIES_NARRATOR',
  PodcastseriesPostProductionEngineer = 'PODCASTSERIES_POST_PRODUCTION_ENGINEER',
  PodcastseriesProducer = 'PODCASTSERIES_PRODUCER',
  PodcastseriesProductionAssistant = 'PODCASTSERIES_PRODUCTION_ASSISTANT',
  PodcastseriesProductionCoordinator = 'PODCASTSERIES_PRODUCTION_COORDINATOR',
  PodcastseriesRemoteRecordingEngineer = 'PODCASTSERIES_REMOTE_RECORDING_ENGINEER',
  PodcastseriesReporter = 'PODCASTSERIES_REPORTER',
  PodcastseriesResearcher = 'PODCASTSERIES_RESEARCHER',
  PodcastseriesSalesManager = 'PODCASTSERIES_SALES_MANAGER',
  PodcastseriesSalesRepresentative = 'PODCASTSERIES_SALES_REPRESENTATIVE',
  PodcastseriesScriptCoordinator = 'PODCASTSERIES_SCRIPT_COORDINATOR',
  PodcastseriesScriptEditor = 'PODCASTSERIES_SCRIPT_EDITOR',
  PodcastseriesSeniorProducer = 'PODCASTSERIES_SENIOR_PRODUCER',
  PodcastseriesSocialMediaManager = 'PODCASTSERIES_SOCIAL_MEDIA_MANAGER',
  PodcastseriesSongwriter = 'PODCASTSERIES_SONGWRITER',
  PodcastseriesSoundDesigner = 'PODCASTSERIES_SOUND_DESIGNER',
  PodcastseriesStoryEditor = 'PODCASTSERIES_STORY_EDITOR',
  PodcastseriesStudioCoordinator = 'PODCASTSERIES_STUDIO_COORDINATOR',
  PodcastseriesTechnicalDirector = 'PODCASTSERIES_TECHNICAL_DIRECTOR',
  PodcastseriesTechnicalManager = 'PODCASTSERIES_TECHNICAL_MANAGER',
  PodcastseriesThemeMusic = 'PODCASTSERIES_THEME_MUSIC',
  PodcastseriesTranscriber = 'PODCASTSERIES_TRANSCRIBER',
  PodcastseriesTranslator = 'PODCASTSERIES_TRANSLATOR',
  PodcastseriesVoiceActor = 'PODCASTSERIES_VOICE_ACTOR',
  PodcastseriesWriter = 'PODCASTSERIES_WRITER'
}

export enum TaddyCountry {
  Afghanistan = 'AFGHANISTAN',
  AlandIslands = 'ALAND_ISLANDS',
  Albania = 'ALBANIA',
  Algeria = 'ALGERIA',
  AmericanSamoa = 'AMERICAN_SAMOA',
  Andorra = 'ANDORRA',
  Angola = 'ANGOLA',
  Anguilla = 'ANGUILLA',
  Antarctica = 'ANTARCTICA',
  AntiguaAndBarbuda = 'ANTIGUA_AND_BARBUDA',
  Argentina = 'ARGENTINA',
  Armenia = 'ARMENIA',
  Aruba = 'ARUBA',
  Australia = 'AUSTRALIA',
  Austria = 'AUSTRIA',
  Azerbaijan = 'AZERBAIJAN',
  Bahamas = 'BAHAMAS',
  Bahrain = 'BAHRAIN',
  Bangladesh = 'BANGLADESH',
  Barbados = 'BARBADOS',
  Belarus = 'BELARUS',
  Belgium = 'BELGIUM',
  Belize = 'BELIZE',
  Benin = 'BENIN',
  Bermuda = 'BERMUDA',
  Bhutan = 'BHUTAN',
  BoliviaPlurinationalStateOf = 'BOLIVIA_PLURINATIONAL_STATE_OF',
  BonaireSintEustatiusAndSaba = 'BONAIRE_SINT_EUSTATIUS_AND_SABA',
  BosniaAndHerzegovina = 'BOSNIA_AND_HERZEGOVINA',
  Botswana = 'BOTSWANA',
  BouvetIsland = 'BOUVET_ISLAND',
  Brazil = 'BRAZIL',
  BritishIndianOceanTerritoryThe = 'BRITISH_INDIAN_OCEAN_TERRITORY_THE',
  BruneiDarussalam = 'BRUNEI_DARUSSALAM',
  Bulgaria = 'BULGARIA',
  BurkinaFaso = 'BURKINA_FASO',
  Burundi = 'BURUNDI',
  CaboVerde = 'CABO_VERDE',
  Cambodia = 'CAMBODIA',
  Cameroon = 'CAMEROON',
  Canada = 'CANADA',
  CaymanIslands = 'CAYMAN_ISLANDS',
  CentralAfricanRepublic = 'CENTRAL_AFRICAN_REPUBLIC',
  Chad = 'CHAD',
  Chile = 'CHILE',
  China = 'CHINA',
  ChristmasIsland = 'CHRISTMAS_ISLAND',
  CocosKeelingIslands = 'COCOS_KEELING_ISLANDS',
  Colombia = 'COLOMBIA',
  Comoros = 'COMOROS',
  Congo = 'CONGO',
  CongoTheDemocraticRepublicOf = 'CONGO_THE_DEMOCRATIC_REPUBLIC_OF',
  CookIslands = 'COOK_ISLANDS',
  CostaRica = 'COSTA_RICA',
  CoteDIvoire = 'COTE_D_IVOIRE',
  Croatia = 'CROATIA',
  Cuba = 'CUBA',
  Curacao = 'CURACAO',
  Cyprus = 'CYPRUS',
  Czechia = 'CZECHIA',
  Denmark = 'DENMARK',
  Djibouti = 'DJIBOUTI',
  Dominica = 'DOMINICA',
  DominicanRepublic = 'DOMINICAN_REPUBLIC',
  Ecuador = 'ECUADOR',
  Egypt = 'EGYPT',
  ElSalvador = 'EL_SALVADOR',
  EquatorialGuinea = 'EQUATORIAL_GUINEA',
  Eritrea = 'ERITREA',
  Estonia = 'ESTONIA',
  Eswatini = 'ESWATINI',
  Ethiopia = 'ETHIOPIA',
  FalklandIslandsTheMalvinas = 'FALKLAND_ISLANDS_THE_MALVINAS',
  FaroeIslands = 'FAROE_ISLANDS',
  Fiji = 'FIJI',
  Finland = 'FINLAND',
  France = 'FRANCE',
  FrenchGuiana = 'FRENCH_GUIANA',
  FrenchPolynesia = 'FRENCH_POLYNESIA',
  FrenchSouthernTerritories = 'FRENCH_SOUTHERN_TERRITORIES',
  Gabon = 'GABON',
  Gambia = 'GAMBIA',
  Georgia = 'GEORGIA',
  Germany = 'GERMANY',
  Ghana = 'GHANA',
  Gibraltar = 'GIBRALTAR',
  Greece = 'GREECE',
  Greenland = 'GREENLAND',
  Grenada = 'GRENADA',
  Guadeloupe = 'GUADELOUPE',
  Guam = 'GUAM',
  Guatemala = 'GUATEMALA',
  Guernsey = 'GUERNSEY',
  Guinea = 'GUINEA',
  GuineaBissau = 'GUINEA_BISSAU',
  Guyana = 'GUYANA',
  Haiti = 'HAITI',
  HeardIslandAndMcdonaldIslands = 'HEARD_ISLAND_AND_MCDONALD_ISLANDS',
  HolySee = 'HOLY_SEE',
  Honduras = 'HONDURAS',
  HongKong = 'HONG_KONG',
  Hungary = 'HUNGARY',
  Iceland = 'ICELAND',
  India = 'INDIA',
  Indonesia = 'INDONESIA',
  Iran = 'IRAN',
  Iraq = 'IRAQ',
  Ireland = 'IRELAND',
  IsleOfMan = 'ISLE_OF_MAN',
  Israel = 'ISRAEL',
  Italy = 'ITALY',
  Jamaica = 'JAMAICA',
  Japan = 'JAPAN',
  Jersey = 'JERSEY',
  Jordan = 'JORDAN',
  Kazakhstan = 'KAZAKHSTAN',
  Kenya = 'KENYA',
  Kiribati = 'KIRIBATI',
  KoreaNorth = 'KOREA_NORTH',
  KoreaSouth = 'KOREA_SOUTH',
  Kuwait = 'KUWAIT',
  Kyrgyzstan = 'KYRGYZSTAN',
  LaoPeoplesDemocraticRepublicThe = 'LAO_PEOPLES_DEMOCRATIC_REPUBLIC_THE',
  Latvia = 'LATVIA',
  Lebanon = 'LEBANON',
  Lesotho = 'LESOTHO',
  Liberia = 'LIBERIA',
  Libya = 'LIBYA',
  Liechtenstein = 'LIECHTENSTEIN',
  Lithuania = 'LITHUANIA',
  Luxembourg = 'LUXEMBOURG',
  Macao = 'MACAO',
  Madagascar = 'MADAGASCAR',
  Malawi = 'MALAWI',
  Malaysia = 'MALAYSIA',
  Maldives = 'MALDIVES',
  Mali = 'MALI',
  Malta = 'MALTA',
  MarshallIslands = 'MARSHALL_ISLANDS',
  Martinique = 'MARTINIQUE',
  Mauritania = 'MAURITANIA',
  Mauritius = 'MAURITIUS',
  Mayotte = 'MAYOTTE',
  Mexico = 'MEXICO',
  MicronesiaFederatedStates = 'MICRONESIA_FEDERATED_STATES',
  MinorOutlyingIslandsUs = 'MINOR_OUTLYING_ISLANDS_US',
  MoldovaTheRepublic = 'MOLDOVA_THE_REPUBLIC',
  Monaco = 'MONACO',
  Mongolia = 'MONGOLIA',
  Montenegro = 'MONTENEGRO',
  Montserrat = 'MONTSERRAT',
  Morocco = 'MOROCCO',
  Mozambique = 'MOZAMBIQUE',
  Myanmar = 'MYANMAR',
  Namibia = 'NAMIBIA',
  Nauru = 'NAURU',
  Nepal = 'NEPAL',
  Netherlands = 'NETHERLANDS',
  NewCaledonia = 'NEW_CALEDONIA',
  NewZealand = 'NEW_ZEALAND',
  Nicaragua = 'NICARAGUA',
  Niger = 'NIGER',
  Nigeria = 'NIGERIA',
  Niue = 'NIUE',
  NorfolkIsland = 'NORFOLK_ISLAND',
  NorthernMarianaIslands = 'NORTHERN_MARIANA_ISLANDS',
  NorthMacedonia = 'NORTH_MACEDONIA',
  Norway = 'NORWAY',
  Oman = 'OMAN',
  Pakistan = 'PAKISTAN',
  Palau = 'PALAU',
  PalestineState = 'PALESTINE_STATE',
  Panama = 'PANAMA',
  PapuaNewGuinea = 'PAPUA_NEW_GUINEA',
  Paraguay = 'PARAGUAY',
  Peru = 'PERU',
  Philippines = 'PHILIPPINES',
  Pitcairn = 'PITCAIRN',
  Poland = 'POLAND',
  Portugal = 'PORTUGAL',
  PuertoRico = 'PUERTO_RICO',
  Qatar = 'QATAR',
  Reunion = 'REUNION',
  Romania = 'ROMANIA',
  Russia = 'RUSSIA',
  Rwanda = 'RWANDA',
  SaintBarthelemy = 'SAINT_BARTHELEMY',
  SaintHelenaAscensionAndTristanDaCunha = 'SAINT_HELENA_ASCENSION_AND_TRISTAN_DA_CUNHA',
  SaintKittsAndNevis = 'SAINT_KITTS_AND_NEVIS',
  SaintLucia = 'SAINT_LUCIA',
  SaintMartinFrenchPart = 'SAINT_MARTIN_FRENCH_PART',
  SaintPierreAndMiquelon = 'SAINT_PIERRE_AND_MIQUELON',
  SaintVincentAndTheGrenadines = 'SAINT_VINCENT_AND_THE_GRENADINES',
  Samoa = 'SAMOA',
  SanMarino = 'SAN_MARINO',
  SaoTomeAndPrincipe = 'SAO_TOME_AND_PRINCIPE',
  SaudiArabia = 'SAUDI_ARABIA',
  Senegal = 'SENEGAL',
  Serbia = 'SERBIA',
  Seychelles = 'SEYCHELLES',
  SierraLeone = 'SIERRA_LEONE',
  Singapore = 'SINGAPORE',
  SintMaartenDutchPart = 'SINT_MAARTEN_DUTCH_PART',
  Slovakia = 'SLOVAKIA',
  Slovenia = 'SLOVENIA',
  SolomonIslands = 'SOLOMON_ISLANDS',
  Somalia = 'SOMALIA',
  SouthAfrica = 'SOUTH_AFRICA',
  SouthGeorgiaAndTheSouthSandwichIslands = 'SOUTH_GEORGIA_AND_THE_SOUTH_SANDWICH_ISLANDS',
  SouthSudan = 'SOUTH_SUDAN',
  Spain = 'SPAIN',
  SriLanka = 'SRI_LANKA',
  Sudan = 'SUDAN',
  Suriname = 'SURINAME',
  SvalbardAndJanMayen = 'SVALBARD_AND_JAN_MAYEN',
  Sweden = 'SWEDEN',
  Switzerland = 'SWITZERLAND',
  Syria = 'SYRIA',
  Taiwan = 'TAIWAN',
  Tajikistan = 'TAJIKISTAN',
  Tanzania = 'TANZANIA',
  Thailand = 'THAILAND',
  TimorLeste = 'TIMOR_LESTE',
  Togo = 'TOGO',
  Tokelau = 'TOKELAU',
  Tonga = 'TONGA',
  TrinidadAndTobago = 'TRINIDAD_AND_TOBAGO',
  Tunisia = 'TUNISIA',
  Turkey = 'TURKEY',
  Turkmenistan = 'TURKMENISTAN',
  TurksAndCaicosIslands = 'TURKS_AND_CAICOS_ISLANDS',
  Tuvalu = 'TUVALU',
  Uganda = 'UGANDA',
  Ukraine = 'UKRAINE',
  UnitedArabEmirates = 'UNITED_ARAB_EMIRATES',
  UnitedKingdom = 'UNITED_KINGDOM',
  UnitedStatesOfAmerica = 'UNITED_STATES_OF_AMERICA',
  Uruguay = 'URUGUAY',
  Uzbekistan = 'UZBEKISTAN',
  Vanuatu = 'VANUATU',
  Venezuela = 'VENEZUELA',
  Vietnam = 'VIETNAM',
  VirginIslandsBritish = 'VIRGIN_ISLANDS_BRITISH',
  VirginIslandsUs = 'VIRGIN_ISLANDS_US',
  WallisAndFutuna = 'WALLIS_AND_FUTUNA',
  WesternSahara = 'WESTERN_SAHARA',
  Yemen = 'YEMEN',
  Zambia = 'ZAMBIA',
  Zimbabwe = 'ZIMBABWE'
}

export type TaddyCreator = {
  __typename?: 'Creator';
  avatarImageAsString?: Maybe<Scalars['String']['output']>;
  avatarImageUrl?: Maybe<Scalars['String']['output']>;
  bio?: Maybe<Scalars['String']['output']>;
  content?: Maybe<Array<Maybe<TaddyCreatorContent>>>;
  contentHash?: Maybe<Scalars['String']['output']>;
  copyright?: Maybe<Scalars['String']['output']>;
  country?: Maybe<TaddyCountry>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  feedRefreshDetails?: Maybe<TaddyFeedRefreshDetails>;
  hash?: Maybe<Scalars['String']['output']>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  links?: Maybe<Array<Maybe<TaddyLinkDetails>>>;
  linksAsString?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  sssOwnerName?: Maybe<Scalars['String']['output']>;
  sssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  sssUrl?: Maybe<Scalars['String']['output']>;
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  totalContentCount?: Maybe<Scalars['Int']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyCreatorContent = {
  __typename?: 'CreatorContent';
  contentPosition?: Maybe<Scalars['Int']['output']>;
  contentType?: Maybe<TaddyTaddyType>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  creatorUuid?: Maybe<Scalars['ID']['output']>;
  hash?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  roles?: Maybe<Array<Maybe<TaddyContentRole>>>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyDevApp = {
  __typename?: 'DevApp';
  apiKey?: Maybe<Scalars['String']['output']>;
  callbackUrl?: Maybe<Scalars['String']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type TaddyDocumentation = {
  __typename?: 'Documentation';
  id?: Maybe<Scalars['ID']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

export type TaddyFeedRefreshDetails = {
  __typename?: 'FeedRefreshDetails';
  dateLastRefreshed?: Maybe<Scalars['Int']['output']>;
  priority?: Maybe<TaddyFeedRefreshPriority>;
  priorityReason?: Maybe<TaddyFeedRefreshPriorityReason>;
  uuid?: Maybe<Scalars['ID']['output']>;
  websubDetails?: Maybe<TaddyWebsubDetails>;
};

export enum TaddyFeedRefreshPriority {
  High = 'HIGH',
  Inactive = 'INACTIVE',
  Low = 'LOW',
  Medium = 'MEDIUM',
  Never = 'NEVER',
  Regular = 'REGULAR',
  Websub = 'WEBSUB'
}

export enum TaddyFeedRefreshPriorityReason {
  DuplicateFeed = 'DUPLICATE_FEED',
  ErrorParsingFeed = 'ERROR_PARSING_FEED',
  FeedUrlNotWorking = 'FEED_URL_NOT_WORKING',
  InactiveForOver_1Year = 'INACTIVE_FOR_OVER_1_YEAR'
}

export enum TaddyGenre {
  ComicseriesAction = 'COMICSERIES_ACTION',
  ComicseriesAnimals = 'COMICSERIES_ANIMALS',
  ComicseriesBl = 'COMICSERIES_BL',
  ComicseriesComedy = 'COMICSERIES_COMEDY',
  ComicseriesCrime = 'COMICSERIES_CRIME',
  ComicseriesDrama = 'COMICSERIES_DRAMA',
  ComicseriesDystopia = 'COMICSERIES_DYSTOPIA',
  ComicseriesEducational = 'COMICSERIES_EDUCATIONAL',
  ComicseriesFantasy = 'COMICSERIES_FANTASY',
  ComicseriesGaming = 'COMICSERIES_GAMING',
  ComicseriesGl = 'COMICSERIES_GL',
  ComicseriesHarem = 'COMICSERIES_HAREM',
  ComicseriesHighSchool = 'COMICSERIES_HIGH_SCHOOL',
  ComicseriesHistorical = 'COMICSERIES_HISTORICAL',
  ComicseriesHorror = 'COMICSERIES_HORROR',
  ComicseriesIsekai = 'COMICSERIES_ISEKAI',
  ComicseriesLgbtq = 'COMICSERIES_LGBTQ',
  ComicseriesMystery = 'COMICSERIES_MYSTERY',
  ComicseriesPostApocalyptic = 'COMICSERIES_POST_APOCALYPTIC',
  ComicseriesRomance = 'COMICSERIES_ROMANCE',
  ComicseriesSciFi = 'COMICSERIES_SCI_FI',
  ComicseriesSliceOfLife = 'COMICSERIES_SLICE_OF_LIFE',
  ComicseriesSports = 'COMICSERIES_SPORTS',
  ComicseriesSuperhero = 'COMICSERIES_SUPERHERO',
  ComicseriesSupernatural = 'COMICSERIES_SUPERNATURAL',
  ComicseriesThriller = 'COMICSERIES_THRILLER',
  ComicseriesZombies = 'COMICSERIES_ZOMBIES',
  PodcastseriesArts = 'PODCASTSERIES_ARTS',
  PodcastseriesArtsBooks = 'PODCASTSERIES_ARTS_BOOKS',
  PodcastseriesArtsDesign = 'PODCASTSERIES_ARTS_DESIGN',
  PodcastseriesArtsFashionAndBeauty = 'PODCASTSERIES_ARTS_FASHION_AND_BEAUTY',
  PodcastseriesArtsFood = 'PODCASTSERIES_ARTS_FOOD',
  PodcastseriesArtsPerformingArts = 'PODCASTSERIES_ARTS_PERFORMING_ARTS',
  PodcastseriesArtsVisualArts = 'PODCASTSERIES_ARTS_VISUAL_ARTS',
  PodcastseriesBusiness = 'PODCASTSERIES_BUSINESS',
  PodcastseriesBusinessCareers = 'PODCASTSERIES_BUSINESS_CAREERS',
  PodcastseriesBusinessEntrepreneurship = 'PODCASTSERIES_BUSINESS_ENTREPRENEURSHIP',
  PodcastseriesBusinessInvesting = 'PODCASTSERIES_BUSINESS_INVESTING',
  PodcastseriesBusinessManagement = 'PODCASTSERIES_BUSINESS_MANAGEMENT',
  PodcastseriesBusinessMarketing = 'PODCASTSERIES_BUSINESS_MARKETING',
  PodcastseriesBusinessNonProfit = 'PODCASTSERIES_BUSINESS_NON_PROFIT',
  PodcastseriesComedy = 'PODCASTSERIES_COMEDY',
  PodcastseriesComedyImprov = 'PODCASTSERIES_COMEDY_IMPROV',
  PodcastseriesComedyInterviews = 'PODCASTSERIES_COMEDY_INTERVIEWS',
  PodcastseriesComedyStandup = 'PODCASTSERIES_COMEDY_STANDUP',
  PodcastseriesEducation = 'PODCASTSERIES_EDUCATION',
  PodcastseriesEducationCourses = 'PODCASTSERIES_EDUCATION_COURSES',
  PodcastseriesEducationHowTo = 'PODCASTSERIES_EDUCATION_HOW_TO',
  PodcastseriesEducationLanguageLearning = 'PODCASTSERIES_EDUCATION_LANGUAGE_LEARNING',
  PodcastseriesEducationSelfImprovement = 'PODCASTSERIES_EDUCATION_SELF_IMPROVEMENT',
  PodcastseriesFiction = 'PODCASTSERIES_FICTION',
  PodcastseriesFictionComedyFiction = 'PODCASTSERIES_FICTION_COMEDY_FICTION',
  PodcastseriesFictionDrama = 'PODCASTSERIES_FICTION_DRAMA',
  PodcastseriesFictionScienceFiction = 'PODCASTSERIES_FICTION_SCIENCE_FICTION',
  PodcastseriesGovernment = 'PODCASTSERIES_GOVERNMENT',
  PodcastseriesHealthAndFitness = 'PODCASTSERIES_HEALTH_AND_FITNESS',
  PodcastseriesHealthAndFitnessAlternativeHealth = 'PODCASTSERIES_HEALTH_AND_FITNESS_ALTERNATIVE_HEALTH',
  PodcastseriesHealthAndFitnessFitness = 'PODCASTSERIES_HEALTH_AND_FITNESS_FITNESS',
  PodcastseriesHealthAndFitnessMedicine = 'PODCASTSERIES_HEALTH_AND_FITNESS_MEDICINE',
  PodcastseriesHealthAndFitnessMentalHealth = 'PODCASTSERIES_HEALTH_AND_FITNESS_MENTAL_HEALTH',
  PodcastseriesHealthAndFitnessNutrition = 'PODCASTSERIES_HEALTH_AND_FITNESS_NUTRITION',
  PodcastseriesHealthAndFitnessSexuality = 'PODCASTSERIES_HEALTH_AND_FITNESS_SEXUALITY',
  PodcastseriesHistory = 'PODCASTSERIES_HISTORY',
  PodcastseriesKidsAndFamily = 'PODCASTSERIES_KIDS_AND_FAMILY',
  PodcastseriesKidsAndFamilyEducationForKids = 'PODCASTSERIES_KIDS_AND_FAMILY_EDUCATION_FOR_KIDS',
  PodcastseriesKidsAndFamilyParenting = 'PODCASTSERIES_KIDS_AND_FAMILY_PARENTING',
  PodcastseriesKidsAndFamilyPetsAndAnimals = 'PODCASTSERIES_KIDS_AND_FAMILY_PETS_AND_ANIMALS',
  PodcastseriesKidsAndFamilyStoriesForKids = 'PODCASTSERIES_KIDS_AND_FAMILY_STORIES_FOR_KIDS',
  PodcastseriesLeisure = 'PODCASTSERIES_LEISURE',
  PodcastseriesLeisureAnimationAndManga = 'PODCASTSERIES_LEISURE_ANIMATION_AND_MANGA',
  PodcastseriesLeisureAutomotive = 'PODCASTSERIES_LEISURE_AUTOMOTIVE',
  PodcastseriesLeisureAviation = 'PODCASTSERIES_LEISURE_AVIATION',
  PodcastseriesLeisureCrafts = 'PODCASTSERIES_LEISURE_CRAFTS',
  PodcastseriesLeisureGames = 'PODCASTSERIES_LEISURE_GAMES',
  PodcastseriesLeisureHobbies = 'PODCASTSERIES_LEISURE_HOBBIES',
  PodcastseriesLeisureHomeAndGarden = 'PODCASTSERIES_LEISURE_HOME_AND_GARDEN',
  PodcastseriesLeisureVideoGames = 'PODCASTSERIES_LEISURE_VIDEO_GAMES',
  PodcastseriesMusic = 'PODCASTSERIES_MUSIC',
  PodcastseriesMusicCommentary = 'PODCASTSERIES_MUSIC_COMMENTARY',
  PodcastseriesMusicHistory = 'PODCASTSERIES_MUSIC_HISTORY',
  PodcastseriesMusicInterviews = 'PODCASTSERIES_MUSIC_INTERVIEWS',
  PodcastseriesNews = 'PODCASTSERIES_NEWS',
  PodcastseriesNewsBusiness = 'PODCASTSERIES_NEWS_BUSINESS',
  PodcastseriesNewsCommentary = 'PODCASTSERIES_NEWS_COMMENTARY',
  PodcastseriesNewsDailyNews = 'PODCASTSERIES_NEWS_DAILY_NEWS',
  PodcastseriesNewsEntertainment = 'PODCASTSERIES_NEWS_ENTERTAINMENT',
  PodcastseriesNewsPolitics = 'PODCASTSERIES_NEWS_POLITICS',
  PodcastseriesNewsSports = 'PODCASTSERIES_NEWS_SPORTS',
  PodcastseriesNewsTech = 'PODCASTSERIES_NEWS_TECH',
  PodcastseriesReligionAndSpirituality = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY',
  PodcastseriesReligionAndSpiritualityBuddhism = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_BUDDHISM',
  PodcastseriesReligionAndSpiritualityChristianity = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_CHRISTIANITY',
  PodcastseriesReligionAndSpiritualityHinduism = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_HINDUISM',
  PodcastseriesReligionAndSpiritualityIslam = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_ISLAM',
  PodcastseriesReligionAndSpiritualityJudaism = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_JUDAISM',
  PodcastseriesReligionAndSpiritualityReligion = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_RELIGION',
  PodcastseriesReligionAndSpiritualitySpirituality = 'PODCASTSERIES_RELIGION_AND_SPIRITUALITY_SPIRITUALITY',
  PodcastseriesScience = 'PODCASTSERIES_SCIENCE',
  PodcastseriesScienceAstronomy = 'PODCASTSERIES_SCIENCE_ASTRONOMY',
  PodcastseriesScienceChemistry = 'PODCASTSERIES_SCIENCE_CHEMISTRY',
  PodcastseriesScienceEarthSciences = 'PODCASTSERIES_SCIENCE_EARTH_SCIENCES',
  PodcastseriesScienceLifeSciences = 'PODCASTSERIES_SCIENCE_LIFE_SCIENCES',
  PodcastseriesScienceMathematics = 'PODCASTSERIES_SCIENCE_MATHEMATICS',
  PodcastseriesScienceNaturalSciences = 'PODCASTSERIES_SCIENCE_NATURAL_SCIENCES',
  PodcastseriesScienceNature = 'PODCASTSERIES_SCIENCE_NATURE',
  PodcastseriesSciencePhysics = 'PODCASTSERIES_SCIENCE_PHYSICS',
  PodcastseriesScienceSocialSciences = 'PODCASTSERIES_SCIENCE_SOCIAL_SCIENCES',
  PodcastseriesSocietyAndCulture = 'PODCASTSERIES_SOCIETY_AND_CULTURE',
  PodcastseriesSocietyAndCultureDocumentary = 'PODCASTSERIES_SOCIETY_AND_CULTURE_DOCUMENTARY',
  PodcastseriesSocietyAndCulturePersonalJournals = 'PODCASTSERIES_SOCIETY_AND_CULTURE_PERSONAL_JOURNALS',
  PodcastseriesSocietyAndCulturePhilosophy = 'PODCASTSERIES_SOCIETY_AND_CULTURE_PHILOSOPHY',
  PodcastseriesSocietyAndCulturePlacesAndTravel = 'PODCASTSERIES_SOCIETY_AND_CULTURE_PLACES_AND_TRAVEL',
  PodcastseriesSocietyAndCultureRelationships = 'PODCASTSERIES_SOCIETY_AND_CULTURE_RELATIONSHIPS',
  PodcastseriesSports = 'PODCASTSERIES_SPORTS',
  PodcastseriesSportsBaseball = 'PODCASTSERIES_SPORTS_BASEBALL',
  PodcastseriesSportsBasketball = 'PODCASTSERIES_SPORTS_BASKETBALL',
  PodcastseriesSportsCricket = 'PODCASTSERIES_SPORTS_CRICKET',
  PodcastseriesSportsFantasySports = 'PODCASTSERIES_SPORTS_FANTASY_SPORTS',
  PodcastseriesSportsFootball = 'PODCASTSERIES_SPORTS_FOOTBALL',
  PodcastseriesSportsGolf = 'PODCASTSERIES_SPORTS_GOLF',
  PodcastseriesSportsHockey = 'PODCASTSERIES_SPORTS_HOCKEY',
  PodcastseriesSportsRugby = 'PODCASTSERIES_SPORTS_RUGBY',
  PodcastseriesSportsRunning = 'PODCASTSERIES_SPORTS_RUNNING',
  PodcastseriesSportsSoccer = 'PODCASTSERIES_SPORTS_SOCCER',
  PodcastseriesSportsSwimming = 'PODCASTSERIES_SPORTS_SWIMMING',
  PodcastseriesSportsTennis = 'PODCASTSERIES_SPORTS_TENNIS',
  PodcastseriesSportsVolleyball = 'PODCASTSERIES_SPORTS_VOLLEYBALL',
  PodcastseriesSportsWilderness = 'PODCASTSERIES_SPORTS_WILDERNESS',
  PodcastseriesSportsWrestling = 'PODCASTSERIES_SPORTS_WRESTLING',
  PodcastseriesTechnology = 'PODCASTSERIES_TECHNOLOGY',
  PodcastseriesTrueCrime = 'PODCASTSERIES_TRUE_CRIME',
  PodcastseriesTvAndFilm = 'PODCASTSERIES_TV_AND_FILM',
  PodcastseriesTvAndFilmAfterShows = 'PODCASTSERIES_TV_AND_FILM_AFTER_SHOWS',
  PodcastseriesTvAndFilmFilmReviews = 'PODCASTSERIES_TV_AND_FILM_FILM_REVIEWS',
  PodcastseriesTvAndFilmHistory = 'PODCASTSERIES_TV_AND_FILM_HISTORY',
  PodcastseriesTvAndFilmInterviews = 'PODCASTSERIES_TV_AND_FILM_INTERVIEWS',
  PodcastseriesTvAndFilmTvReviews = 'PODCASTSERIES_TV_AND_FILM_TV_REVIEWS'
}

export type TaddyHostingProvider = {
  __typename?: 'HostingProvider';
  datePublished?: Maybe<Scalars['Int']['output']>;
  hash?: Maybe<Scalars['String']['output']>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  oauth?: Maybe<TaddyOAuthDetails>;
  oauthAsString?: Maybe<Scalars['String']['output']>;
  sssOwnerName?: Maybe<Scalars['String']['output']>;
  sssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  sssUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyImageVariant {
  Large = 'LARGE',
  Medium = 'MEDIUM',
  Small = 'SMALL'
}

export type TaddyInternalComicIssue = {
  __typename?: 'InternalComicIssue';
  bannerImageUrl?: Maybe<Scalars['String']['output']>;
  blockedReason?: Maybe<Scalars['String']['output']>;
  createdAt?: Maybe<Scalars['Int']['output']>;
  dateExclusiveContentIsAvailable?: Maybe<Scalars['Int']['output']>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  imageUrls?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  imageUrlsProcessing?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  imagesStatus?: Maybe<TaddyInternalPublishImageStatus>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  paymentRuleType?: Maybe<TaddyInternalPaymentRuleType>;
  publishAt?: Maybe<Scalars['Int']['output']>;
  pushNotificationMessage?: Maybe<Scalars['String']['output']>;
  series?: Maybe<TaddyInternalComicSeries>;
  seriesUuid?: Maybe<Scalars['ID']['output']>;
  status?: Maybe<TaddyInternalPublishStatus>;
  stories?: Maybe<Array<Maybe<TaddyInternalComicStory>>>;
  thumbnailImageUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyInternalComicSeries = {
  __typename?: 'InternalComicSeries';
  bannerImageUrl?: Maybe<Scalars['String']['output']>;
  blockedReason?: Maybe<Scalars['String']['output']>;
  copyright?: Maybe<Scalars['String']['output']>;
  counts?: Maybe<TaddyInternalSeriesCounts>;
  coverImageUrl?: Maybe<Scalars['String']['output']>;
  creatorRoles?: Maybe<Array<Maybe<TaddyInternalCreatorRoles>>>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  genre1?: Maybe<TaddyGenre>;
  genre2?: Maybe<TaddyGenre>;
  genre3?: Maybe<TaddyGenre>;
  id?: Maybe<Scalars['ID']['output']>;
  imagesStatus?: Maybe<TaddyInternalPublishImageStatus>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  isCompleted?: Maybe<Scalars['Boolean']['output']>;
  issues?: Maybe<Array<Maybe<TaddyInternalComicIssue>>>;
  language?: Maybe<TaddyLanguage>;
  name?: Maybe<Scalars['String']['output']>;
  rating?: Maybe<TaddyContentRating>;
  seriesLayout?: Maybe<TaddyComicSeriesLayout>;
  seriesStatus?: Maybe<TaddySeriesStatus>;
  seriesType?: Maybe<TaddyComicSeriesType>;
  sssOwnerName?: Maybe<Scalars['String']['output']>;
  sssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  status?: Maybe<TaddyInternalPublishStatus>;
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  thumbnailImageUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyInternalComicStory = {
  __typename?: 'InternalComicStory';
  id?: Maybe<Scalars['ID']['output']>;
  imageUrl?: Maybe<Scalars['String']['output']>;
  position?: Maybe<Scalars['Int']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyInternalCreator = {
  __typename?: 'InternalCreator';
  avatarImageUrl?: Maybe<Scalars['String']['output']>;
  bio?: Maybe<Scalars['String']['output']>;
  copyright?: Maybe<Scalars['String']['output']>;
  country?: Maybe<TaddyCountry>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  imagesStatus?: Maybe<TaddyInternalPublishImageStatus>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  links?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  name?: Maybe<Scalars['String']['output']>;
  sssOwnerName?: Maybe<Scalars['String']['output']>;
  sssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  status?: Maybe<TaddyInternalPublishStatus>;
  tags?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyInternalCreatorRoles = {
  __typename?: 'InternalCreatorRoles';
  contentUuid?: Maybe<Scalars['ID']['output']>;
  creatorUuid?: Maybe<Scalars['ID']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isApproved?: Maybe<Scalars['Boolean']['output']>;
  roles?: Maybe<Array<Maybe<TaddyContentRole>>>;
};

export type TaddyInternalGroup = {
  __typename?: 'InternalGroup';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  isCurrent?: Maybe<Scalars['Boolean']['output']>;
  items?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  name?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyInternalGroupForContent = {
  __typename?: 'InternalGroupForContent';
  contentType: Scalars['String']['output'];
  contentUuid: Scalars['ID']['output'];
  groups?: Maybe<Array<Maybe<TaddyInternalGroup>>>;
};

export type TaddyInternalInvitation = {
  __typename?: 'InternalInvitation';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  email?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  permission?: Maybe<TaddyUserPermission>;
  status?: Maybe<TaddyInvitationStatus>;
};

export enum TaddyInternalPaymentRuleType {
  Free = 'FREE',
  Paid = 'PAID'
}

export enum TaddyInternalPublishImageStatus {
  Complete = 'COMPLETE',
  Processing = 'PROCESSING'
}

export enum TaddyInternalPublishStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Scheduled = 'SCHEDULED'
}

export type TaddyInternalSeriesCounts = {
  __typename?: 'InternalSeriesCounts';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid: Scalars['ID']['output'];
  creators?: Maybe<Scalars['Int']['output']>;
  issues?: Maybe<Scalars['Int']['output']>;
};

export enum TaddyInternalSeriesType {
  InternalComicseries = 'INTERNAL_COMICSERIES',
  InternalCreator = 'INTERNAL_CREATOR'
}

export enum TaddyInvitationStatus {
  Accepted = 'ACCEPTED',
  Expired = 'EXPIRED',
  Pending = 'PENDING'
}

export enum TaddyLanguage {
  Abkhazian = 'ABKHAZIAN',
  Afar = 'AFAR',
  Afrikaans = 'AFRIKAANS',
  Akan = 'AKAN',
  Albanian = 'ALBANIAN',
  Amharic = 'AMHARIC',
  Arabic = 'ARABIC',
  Aragonese = 'ARAGONESE',
  Armenian = 'ARMENIAN',
  Assamese = 'ASSAMESE',
  Avaric = 'AVARIC',
  Avestan = 'AVESTAN',
  Aymara = 'AYMARA',
  Azerbaijani = 'AZERBAIJANI',
  Bambara = 'BAMBARA',
  Bashkir = 'BASHKIR',
  Basque = 'BASQUE',
  Belarusian = 'BELARUSIAN',
  Bengali = 'BENGALI',
  BihariLanguages = 'BIHARI_LANGUAGES',
  Bislama = 'BISLAMA',
  Bosnian = 'BOSNIAN',
  Breton = 'BRETON',
  Bulgarian = 'BULGARIAN',
  Burmese = 'BURMESE',
  CentralKhmer = 'CENTRAL_KHMER',
  Chamorro = 'CHAMORRO',
  Chechen = 'CHECHEN',
  ChichewaChewaNyanja = 'CHICHEWA_CHEWA_NYANJA',
  Chinese = 'CHINESE',
  ChurchSlavonic = 'CHURCH_SLAVONIC',
  Chuvash = 'CHUVASH',
  Cornish = 'CORNISH',
  Corsican = 'CORSICAN',
  Cree = 'CREE',
  Croatian = 'CROATIAN',
  Czech = 'CZECH',
  Danish = 'DANISH',
  DhivehiMaldivian = 'DHIVEHI_MALDIVIAN',
  DutchFlemish = 'DUTCH_FLEMISH',
  Dzongkha = 'DZONGKHA',
  English = 'ENGLISH',
  Esperanto = 'ESPERANTO',
  Estonian = 'ESTONIAN',
  Ewe = 'EWE',
  Faroese = 'FAROESE',
  Farsi = 'FARSI',
  Fijian = 'FIJIAN',
  Finnish = 'FINNISH',
  French = 'FRENCH',
  Fulah = 'FULAH',
  Gaelic = 'GAELIC',
  Galician = 'GALICIAN',
  Ganda = 'GANDA',
  Georgian = 'GEORGIAN',
  German = 'GERMAN',
  Gikuyu = 'GIKUYU',
  Greek = 'GREEK',
  Guarani = 'GUARANI',
  Gujarati = 'GUJARATI',
  HaitianCreole = 'HAITIAN_CREOLE',
  Hausa = 'HAUSA',
  Hebrew = 'HEBREW',
  Herero = 'HERERO',
  Hindi = 'HINDI',
  HiriMotu = 'HIRI_MOTU',
  Hungarian = 'HUNGARIAN',
  Icelandic = 'ICELANDIC',
  Ido = 'IDO',
  Igbo = 'IGBO',
  Indonesian = 'INDONESIAN',
  Interlingua = 'INTERLINGUA',
  InterlingueOccidental = 'INTERLINGUE_OCCIDENTAL',
  Inuktitut = 'INUKTITUT',
  Inupiaq = 'INUPIAQ',
  Irish = 'IRISH',
  Italian = 'ITALIAN',
  Japanese = 'JAPANESE',
  Javanese = 'JAVANESE',
  KalaallisutGreenlandic = 'KALAALLISUT_GREENLANDIC',
  Kannada = 'KANNADA',
  Kanuri = 'KANURI',
  Kashmiri = 'KASHMIRI',
  Kazakh = 'KAZAKH',
  Kinyarwanda = 'KINYARWANDA',
  Komi = 'KOMI',
  Kongo = 'KONGO',
  Korean = 'KOREAN',
  Kurdish = 'KURDISH',
  Kwanyama = 'KWANYAMA',
  Kyrgyz = 'KYRGYZ',
  Lao = 'LAO',
  Latin = 'LATIN',
  Latvian = 'LATVIAN',
  Letzeburgesch = 'LETZEBURGESCH',
  Limburgish = 'LIMBURGISH',
  Lingala = 'LINGALA',
  Lithuanian = 'LITHUANIAN',
  LubaKatanga = 'LUBA_KATANGA',
  Macedonian = 'MACEDONIAN',
  Malagasy = 'MALAGASY',
  Malay = 'MALAY',
  Malayalam = 'MALAYALAM',
  Maltese = 'MALTESE',
  Manx = 'MANX',
  Maori = 'MAORI',
  Marathi = 'MARATHI',
  Marshallese = 'MARSHALLESE',
  Mongolian = 'MONGOLIAN',
  Nauru = 'NAURU',
  Navajo = 'NAVAJO',
  Ndonga = 'NDONGA',
  Nepali = 'NEPALI',
  NorthernSami = 'NORTHERN_SAMI',
  NorthNdebele = 'NORTH_NDEBELE',
  Norwegian = 'NORWEGIAN',
  NorwegianBokmal = 'NORWEGIAN_BOKMAL',
  NorwegianNynorsk = 'NORWEGIAN_NYNORSK',
  NuosuSichuanYi = 'NUOSU_SICHUAN_YI',
  Occitan = 'OCCITAN',
  Ojibwa = 'OJIBWA',
  Oriya = 'ORIYA',
  Oromo = 'OROMO',
  Ossetian = 'OSSETIAN',
  Pali = 'PALI',
  Pashto = 'PASHTO',
  Polish = 'POLISH',
  Portuguese = 'PORTUGUESE',
  Punjabi = 'PUNJABI',
  Quechua = 'QUECHUA',
  RomanianMoldovan = 'ROMANIAN_MOLDOVAN',
  Romansh = 'ROMANSH',
  Rundi = 'RUNDI',
  Russian = 'RUSSIAN',
  Samoan = 'SAMOAN',
  Sango = 'SANGO',
  Sanskrit = 'SANSKRIT',
  Sardinian = 'SARDINIAN',
  Serbian = 'SERBIAN',
  Shona = 'SHONA',
  Sindhi = 'SINDHI',
  Sinhala = 'SINHALA',
  Slovak = 'SLOVAK',
  Slovenian = 'SLOVENIAN',
  Somali = 'SOMALI',
  Sotho = 'SOTHO',
  SouthNdebele = 'SOUTH_NDEBELE',
  Spanish = 'SPANISH',
  Sundanese = 'SUNDANESE',
  Swahili = 'SWAHILI',
  Swati = 'SWATI',
  Swedish = 'SWEDISH',
  Tagalog = 'TAGALOG',
  Tahitian = 'TAHITIAN',
  Tajik = 'TAJIK',
  Tamil = 'TAMIL',
  Tatar = 'TATAR',
  Telugu = 'TELUGU',
  Thai = 'THAI',
  Tibetan = 'TIBETAN',
  Tigrinya = 'TIGRINYA',
  Tonga = 'TONGA',
  Tsonga = 'TSONGA',
  Tswana = 'TSWANA',
  Turkish = 'TURKISH',
  Turkmen = 'TURKMEN',
  Twi = 'TWI',
  Ukrainian = 'UKRAINIAN',
  Urdu = 'URDU',
  Uyghur = 'UYGHUR',
  Uzbek = 'UZBEK',
  ValencianCatalan = 'VALENCIAN_CATALAN',
  Venda = 'VENDA',
  Vietnamese = 'VIETNAMESE',
  Volapuk = 'VOLAPUK',
  Walloon = 'WALLOON',
  Welsh = 'WELSH',
  WesternFrisian = 'WESTERN_FRISIAN',
  Wolof = 'WOLOF',
  Xhosa = 'XHOSA',
  Yiddish = 'YIDDISH',
  Yoruba = 'YORUBA',
  Zhuang = 'ZHUANG',
  Zulu = 'ZULU'
}

export type TaddyLinkDetails = {
  __typename?: 'LinkDetails';
  type?: Maybe<TaddyLinkType>;
  url?: Maybe<Scalars['String']['output']>;
};

export enum TaddyLinkType {
  Bandcamp = 'BANDCAMP',
  Bluesky = 'BLUESKY',
  Discord = 'DISCORD',
  Email = 'EMAIL',
  Etsy = 'ETSY',
  Facebook = 'FACEBOOK',
  Instagram = 'INSTAGRAM',
  KoFi = 'KO_FI',
  Linktree = 'LINKTREE',
  Mastodon = 'MASTODON',
  MerchStore = 'MERCH_STORE',
  Patreon = 'PATREON',
  Pinterest = 'PINTEREST',
  Reddit = 'REDDIT',
  Snapchat = 'SNAPCHAT',
  Soundcloud = 'SOUNDCLOUD',
  Spotify = 'SPOTIFY',
  Telegram = 'TELEGRAM',
  Tiktok = 'TIKTOK',
  Tumblr = 'TUMBLR',
  Twitch = 'TWITCH',
  Twitter = 'TWITTER',
  Vimeo = 'VIMEO',
  Website = 'WEBSITE',
  Wechat = 'WECHAT',
  Whatsapp = 'WHATSAPP',
  Youtube = 'YOUTUBE'
}

export type TaddyMutation = {
  __typename?: 'Mutation';
  addGroupForContent?: Maybe<TaddyInternalGroup>;
  addInternalComicForUser?: Maybe<TaddyInternalComicSeries>;
  addInternalComicIssueForUser?: Maybe<TaddyInternalComicIssue>;
  addInternalCreatorForUser?: Maybe<TaddyInternalCreator>;
  addInternalInvitationForContent?: Maybe<TaddyTeamInternalInvitations>;
  addNewDevApp?: Maybe<TaddyDevApp>;
  addOrUpdateInternalCreatorRolesForContent?: Maybe<TaddyTeamInternalCreatorRoles>;
  addPaymentRuleForContent?: Maybe<TaddyPaymentRule>;
  addWebhookUrlForUser?: Maybe<TaddyWebhook>;
  addWebtoonsSeriesData?: Maybe<Scalars['Boolean']['output']>;
  deleteGroupForContent?: Maybe<Scalars['ID']['output']>;
  deleteInternalComicForUser?: Maybe<Scalars['ID']['output']>;
  deleteInternalComicIssueForUser?: Maybe<Scalars['ID']['output']>;
  deleteInternalCreatorForUser?: Maybe<Scalars['ID']['output']>;
  deletePaymentRuleForContent?: Maybe<Scalars['ID']['output']>;
  deleteWebhookForUser?: Maybe<Scalars['ID']['output']>;
  expireInternalInvitationForContent?: Maybe<TaddyTeamInternalInvitations>;
  generateWebhookEventsFromIds?: Maybe<Array<Maybe<TaddyWebhookEvent>>>;
  updateDevClient?: Maybe<TaddyDevApp>;
  updateGroupForContent?: Maybe<TaddyInternalGroup>;
  updateInternalComicForUser?: Maybe<TaddyInternalComicSeries>;
  updateInternalComicIssueForUser?: Maybe<TaddyInternalComicIssue>;
  updateInternalCreatorForUser?: Maybe<TaddyInternalCreator>;
  updatePaymentRuleForContent?: Maybe<TaddyPaymentRule>;
  updateStatusForInternalComicSeries?: Maybe<TaddyInternalComicSeries>;
  updateStatusForInternalCreator?: Maybe<TaddyInternalCreator>;
  updateWebhookForUser?: Maybe<TaddyWebhook>;
};

export type TaddyOAuthDetails = {
  __typename?: 'OAuthDetails';
  authorizeUrl?: Maybe<Scalars['String']['output']>;
  instructionsUrl?: Maybe<Scalars['String']['output']>;
  newAccessTokenUrl?: Maybe<Scalars['String']['output']>;
  newContentTokenUrl?: Maybe<Scalars['String']['output']>;
  newRefreshTokenUrl?: Maybe<Scalars['String']['output']>;
  publicKey?: Maybe<Scalars['String']['output']>;
  signupUrl?: Maybe<Scalars['String']['output']>;
  tokenUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddyPaymentRule = {
  __typename?: 'PaymentRule';
  contentType: Scalars['String']['output'];
  contentUuid: Scalars['ID']['output'];
  createdAt?: Maybe<Scalars['Int']['output']>;
  group?: Maybe<TaddyInternalGroup>;
  groupId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  platform?: Maybe<TaddyPlatform>;
  platformPlanId?: Maybe<Scalars['ID']['output']>;
  platformPriceId?: Maybe<Scalars['ID']['output']>;
  platformUserId?: Maybe<Scalars['String']['output']>;
  ruleType?: Maybe<TaddyPaymentRuleType>;
  ruleValue?: Maybe<Scalars['Int']['output']>;
  status?: Maybe<TaddyPaymentRuleStatus>;
  updatedAt?: Maybe<Scalars['Int']['output']>;
};

export enum TaddyPaymentRuleStatus {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE',
  Processing = 'PROCESSING'
}

export enum TaddyPaymentRuleType {
  Group = 'GROUP',
  LastX = 'LAST_X'
}

export type TaddyPaymentRulesForContent = {
  __typename?: 'PaymentRulesForContent';
  contentType: Scalars['String']['output'];
  contentUuid: Scalars['ID']['output'];
  rules?: Maybe<Array<Maybe<TaddyPaymentRule>>>;
};

export type TaddyPerson = {
  __typename?: 'Person';
  imageUrl?: Maybe<Scalars['String']['output']>;
  isAutoGenerated?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  role?: Maybe<TaddyContentRole>;
  url?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyPlatform {
  Patreon = 'PATREON'
}

export type TaddyPlatformDetails = {
  __typename?: 'PlatformDetails';
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  platform?: Maybe<TaddyPlatform>;
  platformUserId?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type TaddyPlatformDetailsForContent = {
  __typename?: 'PlatformDetailsForContent';
  contentType: Scalars['String']['output'];
  contentUuid: Scalars['ID']['output'];
  details?: Maybe<Array<Maybe<TaddyPlatformDetails>>>;
  plans?: Maybe<Array<Maybe<TaddyPlatformPlan>>>;
  prices?: Maybe<Array<Maybe<TaddyPlatformPrice>>>;
};

export type TaddyPlatformPlan = {
  __typename?: 'PlatformPlan';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  platform?: Maybe<TaddyPlatform>;
  platformUserId?: Maybe<Scalars['String']['output']>;
  prices?: Maybe<Array<Maybe<TaddyPlatformPrice>>>;
};

export type TaddyPlatformPrice = {
  __typename?: 'PlatformPrice';
  amountInCents?: Maybe<Scalars['Int']['output']>;
  currency?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  interval?: Maybe<TaddyPlatformPriceInterval>;
  name?: Maybe<Scalars['String']['output']>;
  planId?: Maybe<Scalars['ID']['output']>;
  platform?: Maybe<TaddyPlatform>;
  platformUserId?: Maybe<Scalars['String']['output']>;
  priceId?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyPlatformPriceInterval {
  Monthly = 'MONTHLY',
  PerItem = 'PER_ITEM',
  Yearly = 'YEARLY'
}

export enum TaddyPodcastContentType {
  Audio = 'AUDIO',
  Video = 'VIDEO'
}

export type TaddyPodcastEpisode = {
  __typename?: 'PodcastEpisode';
  audioUrl?: Maybe<Scalars['String']['output']>;
  chapters?: Maybe<Array<Maybe<TaddyChapter>>>;
  chaptersUrls?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  chaptersUrlsWithDetails?: Maybe<Array<Maybe<TaddyChapterLink>>>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  descriptionLinks?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  duration?: Maybe<Scalars['Int']['output']>;
  episodeNumber?: Maybe<Scalars['Int']['output']>;
  episodeType?: Maybe<TaddyPodcastEpisodeType>;
  fileLength?: Maybe<Scalars['Int']['output']>;
  fileType?: Maybe<Scalars['String']['output']>;
  guid?: Maybe<Scalars['String']['output']>;
  hash?: Maybe<Scalars['String']['output']>;
  imageUrl?: Maybe<Scalars['String']['output']>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  isExplicitContent?: Maybe<Scalars['Boolean']['output']>;
  isRemoved?: Maybe<Scalars['Boolean']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  persons?: Maybe<Array<Maybe<TaddyPerson>>>;
  podcastSeries?: Maybe<TaddyPodcastSeries>;
  seasonNumber?: Maybe<Scalars['Int']['output']>;
  subtitle?: Maybe<Scalars['String']['output']>;
  taddyTranscribeStatus?: Maybe<TaddyPodcastEpisodeTranscriptionStatus>;
  transcript?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  transcriptUrls?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  transcriptUrlsWithDetails?: Maybe<Array<Maybe<TaddyTranscriptLink>>>;
  transcriptWithSpeakersAndTimecodes?: Maybe<Array<Maybe<TaddyTranscriptItem>>>;
  uuid?: Maybe<Scalars['ID']['output']>;
  videoUrl?: Maybe<Scalars['String']['output']>;
  websiteUrl?: Maybe<Scalars['String']['output']>;
};

export enum TaddyPodcastEpisodeTranscriptionStatus {
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  NotTranscribing = 'NOT_TRANSCRIBING',
  Processing = 'PROCESSING'
}

export enum TaddyPodcastEpisodeType {
  Bonus = 'BONUS',
  Full = 'FULL',
  Trailer = 'TRAILER'
}

export type TaddyPodcastSeries = {
  __typename?: 'PodcastSeries';
  authorName?: Maybe<Scalars['String']['output']>;
  childrenHash?: Maybe<Scalars['String']['output']>;
  contentType?: Maybe<TaddyPodcastContentType>;
  copyright?: Maybe<Scalars['String']['output']>;
  datePublished?: Maybe<Scalars['Int']['output']>;
  description?: Maybe<Scalars['String']['output']>;
  descriptionLinks?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  episodes?: Maybe<Array<Maybe<TaddyPodcastEpisode>>>;
  feedRefreshDetails?: Maybe<TaddyFeedRefreshDetails>;
  genres?: Maybe<Array<Maybe<TaddyGenre>>>;
  hash?: Maybe<Scalars['String']['output']>;
  imageUrl?: Maybe<Scalars['String']['output']>;
  isBlocked?: Maybe<Scalars['Boolean']['output']>;
  isComplete?: Maybe<Scalars['Boolean']['output']>;
  isCompleted?: Maybe<Scalars['Boolean']['output']>;
  isExplicitContent?: Maybe<Scalars['Boolean']['output']>;
  itunesId?: Maybe<Scalars['Int']['output']>;
  itunesInfo?: Maybe<TaddyITunesInfo>;
  language?: Maybe<TaddyLanguage>;
  name?: Maybe<Scalars['String']['output']>;
  persons?: Maybe<Array<Maybe<TaddyPerson>>>;
  popularityRank?: Maybe<TaddyPopularityRank>;
  rssOwnerName?: Maybe<Scalars['String']['output']>;
  rssOwnerPublicEmail?: Maybe<Scalars['String']['output']>;
  rssUrl?: Maybe<Scalars['String']['output']>;
  seriesType?: Maybe<TaddyPodcastSeriesType>;
  taddyTranscribeStatus?: Maybe<TaddyPodcastSeriesTranscriptionStatus>;
  totalEpisodesCount?: Maybe<Scalars['Int']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
  websiteUrl?: Maybe<Scalars['String']['output']>;
};

export enum TaddyPodcastSeriesTranscriptionStatus {
  CreatorAskedNotToTranscribe = 'CREATOR_ASKED_NOT_TO_TRANSCRIBE',
  NotTranscribing = 'NOT_TRANSCRIBING',
  Transcribing = 'TRANSCRIBING'
}

export enum TaddyPodcastSeriesType {
  Episodic = 'EPISODIC',
  Serial = 'SERIAL'
}

export enum TaddyPopularityRank {
  Top_200 = 'TOP_200',
  Top_1000 = 'TOP_1000',
  Top_2000 = 'TOP_2000',
  Top_3000 = 'TOP_3000',
  Top_4000 = 'TOP_4000',
  Top_5000 = 'TOP_5000',
  Top_10000 = 'TOP_10000',
  Top_20000 = 'TOP_20000',
  Top_50000 = 'TOP_50000',
  Top_100000 = 'TOP_100000',
  Top_200000 = 'TOP_200000'
}

export type TaddyPopularityResult = {
  __typename?: 'PopularityResult';
  podcastSeries?: Maybe<Array<Maybe<TaddyPodcastSeries>>>;
  popularityRankId: Scalars['ID']['output'];
};

export type TaddyPublicClientDetails = {
  __typename?: 'PublicClientDetails';
  description?: Maybe<Scalars['String']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  logoUrl?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
};

export type TaddyPublicContentDetails = {
  __typename?: 'PublicContentDetails';
  creators?: Maybe<Array<Maybe<TaddyPublicCreatorDetails>>>;
  name?: Maybe<Scalars['String']['output']>;
  taddyType?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['ID']['output'];
};

export type TaddyPublicCreatorDetails = {
  __typename?: 'PublicCreatorDetails';
  avatarImageAsString?: Maybe<Scalars['String']['output']>;
  avatarImageUrl?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  uuid: Scalars['ID']['output'];
};

export type TaddyQuery = {
  __typename?: 'Query';
  getComicIssue?: Maybe<TaddyComicIssue>;
  getComicSeries?: Maybe<TaddyComicSeries>;
  getComicStory?: Maybe<TaddyComicStory>;
  getCreator?: Maybe<TaddyCreator>;
  getCreatorContent?: Maybe<TaddyCreatorContent>;
  getDocumenation?: Maybe<TaddyDocumentation>;
  getEpisodeChapters?: Maybe<Array<Maybe<TaddyChapter>>>;
  getEpisodeTranscript?: Maybe<Array<Maybe<TaddyTranscriptItem>>>;
  getGroupsForContent?: Maybe<TaddyInternalGroupForContent>;
  getHostingProvider?: Maybe<TaddyHostingProvider>;
  getInternalComicForUser?: Maybe<TaddyInternalComicSeries>;
  getInternalComicIssue?: Maybe<TaddyInternalComicIssue>;
  getInternalCreatorForUser?: Maybe<TaddyInternalCreator>;
  getInternalCreatorRolesForContent?: Maybe<TaddyTeamInternalCreatorRoles>;
  getInternalCreatorsForContent?: Maybe<Array<Maybe<TaddyInternalCreator>>>;
  getInternalCreatorsForUser?: Maybe<Array<Maybe<TaddyInternalCreator>>>;
  getInternalInvitationsForContent?: Maybe<TaddyTeamInternalInvitations>;
  getItunesInfo?: Maybe<TaddyITunesInfo>;
  getLatestPodcastEpisodes?: Maybe<Array<Maybe<TaddyPodcastEpisode>>>;
  getMultipleComicIssues?: Maybe<Array<Maybe<TaddyComicIssue>>>;
  getMultipleComicSeries?: Maybe<Array<Maybe<TaddyComicSeries>>>;
  getMultipleComicStories?: Maybe<Array<Maybe<TaddyComicStory>>>;
  getMultipleCreators?: Maybe<Array<Maybe<TaddyCreator>>>;
  getMultiplePodcastEpisodes?: Maybe<Array<Maybe<TaddyPodcastEpisode>>>;
  getMultiplePodcastSeries?: Maybe<Array<Maybe<TaddyPodcastSeries>>>;
  getMyDeveloperApplications?: Maybe<TaddyUserDevApps>;
  getMyDeveloperWebhooks?: Maybe<TaddyUserWebhooks>;
  getMyInternalSeries?: Maybe<TaddyUserInternalSeriesList>;
  getPaymentRulesForContent?: Maybe<TaddyPaymentRulesForContent>;
  getPermissionForItem?: Maybe<TaddyUserPermission>;
  getPlatformsForContent?: Maybe<TaddyPlatformDetailsForContent>;
  getPodcastEpisode?: Maybe<TaddyPodcastEpisode>;
  getPodcastSeries?: Maybe<TaddyPodcastSeries>;
  getPopularContent?: Maybe<TaddyPopularityResult>;
  getPreviewDetailsForSeries?: Maybe<TaddyContentInternalSeriesList>;
  getPublicClientDetails?: Maybe<TaddyPublicClientDetails>;
  getPublicContentDetails?: Maybe<TaddyPublicContentDetails>;
  getTopCharts?: Maybe<TaddyTopChartsResults>;
  getTopChartsByCountry?: Maybe<TaddyTopChartsResults>;
  getTopChartsByGenres?: Maybe<TaddyTopChartsResults>;
  getWebtoonsSeriesData?: Maybe<TaddyWebtoonSeriesData>;
  me?: Maybe<TaddyUser>;
  search?: Maybe<TaddySearchResults>;
  searchForTerm?: Maybe<TaddySearchResults>;
};

export enum TaddySearchContentType {
  Comicseries = 'COMICSERIES',
  Creator = 'CREATOR',
  Podcastepisode = 'PODCASTEPISODE',
  Podcastseries = 'PODCASTSERIES'
}

export enum TaddySearchMatchType {
  AllTerms = 'ALL_TERMS',
  ExactPhrase = 'EXACT_PHRASE',
  MostTerms = 'MOST_TERMS'
}

export enum TaddySearchOperator {
  And = 'AND',
  ExactPhrase = 'EXACT_PHRASE',
  Or = 'OR'
}

export type TaddySearchQueryResponseInfo = {
  __typename?: 'SearchQueryResponseInfo';
  responseInfoDetails?: Maybe<Array<Maybe<TaddySearchQueryResponseInfoDetails>>>;
  searchId: Scalars['ID']['output'];
  took?: Maybe<Scalars['Int']['output']>;
};

export type TaddySearchQueryResponseInfoDetails = {
  __typename?: 'SearchQueryResponseInfoDetails';
  pagesCount?: Maybe<Scalars['Int']['output']>;
  searchId: Scalars['ID']['output'];
  totalCount?: Maybe<Scalars['Int']['output']>;
  type?: Maybe<TaddyTaddyType>;
};

export type TaddySearchRankingDetails = {
  __typename?: 'SearchRankingDetails';
  id: Scalars['ID']['output'];
  rankingScore?: Maybe<Scalars['Int']['output']>;
  rankingScoreDetailsAsString?: Maybe<Scalars['String']['output']>;
  type?: Maybe<TaddySearchContentType>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export type TaddySearchResponseDetails = {
  __typename?: 'SearchResponseDetails';
  id: Scalars['ID']['output'];
  pagesCount?: Maybe<Scalars['Int']['output']>;
  totalCount?: Maybe<Scalars['Int']['output']>;
  type?: Maybe<TaddySearchContentType>;
};

export enum TaddySearchResultBoostType {
  BoostExactPhrase = 'BOOST_EXACT_PHRASE',
  BoostExactTerm = 'BOOST_EXACT_TERM',
  BoostPopularityALittle = 'BOOST_POPULARITY_A_LITTLE',
  BoostPopularityALot = 'BOOST_POPULARITY_A_LOT'
}

export type TaddySearchResults = {
  __typename?: 'SearchResults';
  comicIssues?: Maybe<Array<Maybe<TaddyComicIssue>>>;
  comicSeries?: Maybe<Array<Maybe<TaddyComicSeries>>>;
  creators?: Maybe<Array<Maybe<TaddyCreator>>>;
  podcastEpisodes?: Maybe<Array<Maybe<TaddyPodcastEpisode>>>;
  podcastSeries?: Maybe<Array<Maybe<TaddyPodcastSeries>>>;
  queryResponseInfo?: Maybe<TaddySearchQueryResponseInfo>;
  rankingDetails?: Maybe<Array<Maybe<TaddySearchRankingDetails>>>;
  responseDetails?: Maybe<Array<Maybe<TaddySearchResponseDetails>>>;
  searchId: Scalars['ID']['output'];
};

export enum TaddySearchSortOrder {
  Exactness = 'EXACTNESS',
  Popularity = 'POPULARITY'
}

export enum TaddySeriesStatus {
  Announced = 'ANNOUNCED',
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Hiatus = 'HIATUS',
  Ongoing = 'ONGOING',
  UnderRevision = 'UNDER_REVISION'
}

export enum TaddySortOrder {
  Latest = 'LATEST',
  Oldest = 'OLDEST',
  Search = 'SEARCH'
}

export enum TaddyTaddyType {
  Comicissue = 'COMICISSUE',
  Comicseries = 'COMICSERIES',
  Creator = 'CREATOR',
  Podcastepisode = 'PODCASTEPISODE',
  Podcastseries = 'PODCASTSERIES'
}

export type TaddyTeamInternalCreatorRoles = {
  __typename?: 'TeamInternalCreatorRoles';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  creatorRoles?: Maybe<Array<Maybe<TaddyInternalCreatorRoles>>>;
  internalCreators?: Maybe<Array<Maybe<TaddyInternalCreator>>>;
};

export type TaddyTeamInternalInvitations = {
  __typename?: 'TeamInternalInvitations';
  contentType?: Maybe<Scalars['String']['output']>;
  contentUuid?: Maybe<Scalars['ID']['output']>;
  invitations?: Maybe<Array<Maybe<TaddyInternalInvitation>>>;
};

export type TaddyTopChartsResults = {
  __typename?: 'TopChartsResults';
  by?: Maybe<TaddyTopChartsType>;
  country?: Maybe<TaddyCountry>;
  genre?: Maybe<TaddyGenre>;
  podcastEpisodes?: Maybe<Array<Maybe<TaddyPodcastEpisode>>>;
  podcastSeries?: Maybe<Array<Maybe<TaddyPodcastSeries>>>;
  source?: Maybe<TaddyTopChartsSource>;
  taddyType?: Maybe<TaddyTaddyType>;
  topChartsId: Scalars['ID']['output'];
};

export enum TaddyTopChartsSource {
  ApplePodcasts = 'APPLE_PODCASTS'
}

export enum TaddyTopChartsType {
  Country = 'COUNTRY',
  Genre = 'GENRE'
}

export type TaddyTranscriptItem = {
  __typename?: 'TranscriptItem';
  endTimecode?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  speaker?: Maybe<Scalars['String']['output']>;
  startTimecode?: Maybe<Scalars['Int']['output']>;
  text?: Maybe<Scalars['String']['output']>;
};

export enum TaddyTranscriptItemStyle {
  Paragraph = 'PARAGRAPH',
  Utterance = 'UTTERANCE'
}

export type TaddyTranscriptLink = {
  __typename?: 'TranscriptLink';
  hasTimecodes?: Maybe<Scalars['Boolean']['output']>;
  isTaddyExclusive?: Maybe<Scalars['Boolean']['output']>;
  language?: Maybe<Scalars['String']['output']>;
  type?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type TaddyUser = {
  __typename?: 'User';
  createdAt?: Maybe<Scalars['Int']['output']>;
  id?: Maybe<Scalars['ID']['output']>;
  myDeveloperBillingPlanDetails?: Maybe<TaddyUserDeveloperBillingPlanDetails>;
  myDeveloperDetails?: Maybe<TaddyUserDeveloperDetails>;
};

export type TaddyUserDevApps = {
  __typename?: 'UserDevApps';
  devApps?: Maybe<Array<Maybe<TaddyDevApp>>>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type TaddyUserDeveloperBillingPlanDetails = {
  __typename?: 'UserDeveloperBillingPlanDetails';
  addons?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  cancelAt?: Maybe<Scalars['Float']['output']>;
  currentPeriodEnd?: Maybe<Scalars['Float']['output']>;
  endedAt?: Maybe<Scalars['Float']['output']>;
  primaryProduct?: Maybe<Scalars['String']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type TaddyUserDeveloperDetails = {
  __typename?: 'UserDeveloperDetails';
  allowedApiCallsLimit?: Maybe<Scalars['Int']['output']>;
  allowedDevAppsLimit?: Maybe<Scalars['Int']['output']>;
  allowedOnDemandTranscriptsLimit?: Maybe<Scalars['Int']['output']>;
  allowedPopularEpisodeTranscriptsLimit?: Maybe<Scalars['Int']['output']>;
  allowedWebhookLimit?: Maybe<Scalars['Int']['output']>;
  currentApiUsage?: Maybe<Scalars['Int']['output']>;
  currentOnDemandTranscriptsUsage?: Maybe<Scalars['Int']['output']>;
  currentPopularEpisodeTranscriptsUsage?: Maybe<Scalars['Int']['output']>;
  isBusinessPlan?: Maybe<Scalars['Boolean']['output']>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export type TaddyUserInternalSeriesList = {
  __typename?: 'UserInternalSeriesList';
  internalcomicseries?: Maybe<Array<Maybe<TaddyInternalComicSeries>>>;
  internalcreators?: Maybe<Array<Maybe<TaddyInternalCreator>>>;
  userId?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyUserPermission {
  Admin = 'ADMIN',
  Contributor = 'CONTRIBUTOR',
  Owner = 'OWNER',
  Viewer = 'VIEWER'
}

export type TaddyUserWebhooks = {
  __typename?: 'UserWebhooks';
  userId?: Maybe<Scalars['ID']['output']>;
  webhooks?: Maybe<Array<Maybe<TaddyWebhook>>>;
};

export type TaddyWebhook = {
  __typename?: 'Webhook';
  createdAt?: Maybe<Scalars['Int']['output']>;
  endpointUrl?: Maybe<Scalars['String']['output']>;
  events?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  id: Scalars['ID']['output'];
  isActive?: Maybe<Scalars['Boolean']['output']>;
  isVerified?: Maybe<Scalars['Boolean']['output']>;
  user?: Maybe<TaddyUser>;
  webhookSecret?: Maybe<Scalars['String']['output']>;
};

export type TaddyWebhookEvent = {
  __typename?: 'WebhookEvent';
  action?: Maybe<TaddyWebhookEventActionType>;
  itunesInfo?: Maybe<TaddyITunesInfo>;
  podcastEpisode?: Maybe<TaddyPodcastEpisode>;
  podcastSeries?: Maybe<TaddyPodcastSeries>;
  taddyType?: Maybe<Scalars['String']['output']>;
  timestamp?: Maybe<Scalars['Float']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};

export enum TaddyWebhookEventActionType {
  Created = 'created',
  Deleted = 'deleted',
  NewEpisodesReleased = 'new_episodes_released',
  Updated = 'updated'
}

export type TaddyWebsubDetails = {
  __typename?: 'WebsubDetails';
  isVerified?: Maybe<Scalars['Boolean']['output']>;
  topicUrl?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
  websubHubUrl?: Maybe<Scalars['String']['output']>;
};

export type TaddyWebtoonSeriesData = {
  __typename?: 'WebtoonSeriesData';
  description?: Maybe<Scalars['String']['output']>;
  genre1?: Maybe<TaddyGenre>;
  genre2?: Maybe<TaddyGenre>;
  id?: Maybe<Scalars['ID']['output']>;
  language?: Maybe<TaddyLanguage>;
  name?: Maybe<Scalars['String']['output']>;
};

export type TaddyITunesInfo = {
  __typename?: 'iTunesInfo';
  baseArtworkUrl?: Maybe<Scalars['String']['output']>;
  baseArtworkUrlOf?: Maybe<Scalars['String']['output']>;
  country?: Maybe<TaddyCountry>;
  hash?: Maybe<Scalars['String']['output']>;
  podcastSeries?: Maybe<TaddyPodcastSeries>;
  publisherId?: Maybe<Scalars['Int']['output']>;
  publisherName?: Maybe<Scalars['String']['output']>;
  subtitle?: Maybe<Scalars['String']['output']>;
  summary?: Maybe<Scalars['String']['output']>;
  uuid?: Maybe<Scalars['ID']['output']>;
};



export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


export function getSdk(_client: GraphQLClient) {
  return {

  };
}
export type Sdk = ReturnType<typeof getSdk>;