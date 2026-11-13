#!/usr/bin/env node
/**
 * check-icons.mjs — heal-then-gate for @tabler/icons-react icon names.
 *
 * Failure mode this addresses: the agent's training prior is Lucide (shadcn's
 * default icon set). When it does not know the Tabler name for a concept it
 * writes the LUCIDE name with an `Icon` prefix — `IconUtensils`, `IconWrench`,
 * `IconHardHat` (every historical incident followed this pattern; none of
 * them is a Tabler export). `tsc` catches it, but only ~20s into `npm run
 * build`, and the agent's replacement guess costs another round-trip.
 *
 * STAGE-1 HEALING: the ALIASES table below maps the full Lucide catalog
 * (plus observed agent compositions like `IconUtensilsFork`) onto verified
 * Tabler exports. A hallucinated name with a table entry is REWRITTEN in
 * place (import + all usages) instead of reported — zero agent time. This is
 * a SEMANTIC table, not nearest-string distance: fuzzy suggestions were
 * removed once before because they misled (IconHardHat → IconCarFan). Every
 * replacement is double-checked against the actually installed export list
 * before it is applied, so a Tabler version drift degrades to the error path
 * instead of writing a broken name.
 *
 * Names that are invalid AND not in the table still fail the gate (exit 1):
 * a rare, cheap fix loop beats silently shipping a semantically wrong icon.
 *
 * Fail-OPEN if the name source can't be located (package layout changed): warn
 * and skip rather than block — tsc remains the safety net. Fail-CLOSED only on
 * a name that is provably absent from a real, large export list.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Lucide-vocabulary → Tabler aliases (generated + hand-curated) ──────────
const ALIASES = {
  IconAArrowDown: 'IconTextDecrease', IconAArrowUp: 'IconTextIncrease', IconAccessibility: 'IconDisabledOff',
  IconAirplay: 'IconCast', IconAirVent: 'IconAirConditioning', IconALargeSmall: 'IconLetterCase',
  IconAlarmClock: 'IconAlarm', IconAlarmClockCheck: 'IconAlarm', IconAlarmClockMinus: 'IconAlarmMinus',
  IconAlarmClockOff: 'IconAlarmOff', IconAlarmClockPlus: 'IconAlarmPlus', IconAngry: 'IconMoodAngry',
  IconAnnoyed: 'IconMoodAnnoyed', IconArchiveRestore: 'IconArchiveOff', IconArchiveX: 'IconArchiveOff',
  IconArrowDown01: 'IconSortAscendingNumbers', IconArrowDown10: 'IconSortDescendingNumbers', IconArrowDownAZ: 'IconSortAscendingLetters',
  IconArrowDownNarrowWide: 'IconSortAscending', IconArrowDownUp: 'IconArrowsSort', IconArrowDownWideNarrow: 'IconSortDescending',
  IconArrowDownZA: 'IconSortDescendingLetters', IconArrowRightLeft: 'IconArrowLeftRight', IconArrowUp01: 'IconSortAscendingNumbers',
  IconArrowUp10: 'IconSortDescendingNumbers', IconArrowUpAZ: 'IconSortAscendingLetters', IconArrowUpDown: 'IconArrowsSort',
  IconArrowUpNarrowWide: 'IconSortAscending', IconArrowUpWideNarrow: 'IconSortAscending', IconArrowUpZA: 'IconSortDescendingLetters',
  IconAtSign: 'IconAt', IconAudioLines: 'IconWaveSine', IconAudioWaveform: 'IconWaveSine',
  IconBaby: 'IconBabyCarriage', IconBadgeAlert: 'IconAlertCircleFilled', IconBadgeCheck: 'IconDiscountCheck',
  IconBadgeDollarSign: 'IconCoinFilled', IconBadgeEuro: 'IconCoinEuroFilled', IconBadgeInfo: 'IconInfoCircleFilled',
  IconBadgeMinus: 'IconCircleMinus', IconBadgePercent: 'IconDiscount', IconBadgePlus: 'IconCirclePlusFilled',
  IconBadgeX: 'IconCircleXFilled', IconBanknote: 'IconCash', IconBanknoteCheck: 'IconCashBanknote',
  IconBatteryFull: 'IconBattery4', IconBatteryLow: 'IconBattery1', IconBatteryMedium: 'IconBattery3',
  IconBatteryWarning: 'IconBatteryOff', IconBedDouble: 'IconBed', IconBedSingle: 'IconBedFlat',
  IconBeef: 'IconMeat', IconBellDot: 'IconBellExclamation', IconBellElectric: 'IconBell',
  IconBellRing: 'IconBellRinging', IconBird: 'IconFeather', IconBitcoin: 'IconCurrencyBitcoin',
  IconBlinds: 'IconBlendMode', IconBookA: 'IconBook', IconBookAlert: 'IconBook',
  IconBookAudio: 'IconBook', IconBookCheck: 'IconBook', IconBookDashed: 'IconBook',
  IconBookHeadphones: 'IconBook', IconBookHeart: 'IconBook', IconBookImage: 'IconPhotoStar',
  IconBookKey: 'IconPassword', IconBookLock: 'IconBook', IconBookmarkCheck: 'IconBookmarkFilled',
  IconBookMarked: 'IconBookmarks', IconBookmarkX: 'IconBookmarkOff', IconBookOpen: 'IconBook2',
  IconBookOpenCheck: 'IconBook2', IconBookOpenText: 'IconBook2', IconBookText: 'IconBook',
  IconBookType: 'IconTypography', IconBookUser: 'IconAddressBook', IconBookX: 'IconBookOff',
  IconBot: 'IconRobot', IconBotMessageSquare: 'IconMessageChatbot', IconBotOff: 'IconRobotOff',
  IconBoxes: 'IconPackages', IconBrainCircuit: 'IconBrandOpenai', IconBrainCog: 'IconSettings2',
  IconBrickWall: 'IconWall', IconBriefcaseBusiness: 'IconBriefcase', IconBriefcaseConveyorBelt: 'IconBriefcase',
  IconBriefcaseMedical: 'IconFirstAidKit', IconBringToFront: 'IconStackFront', IconBuilding2: 'IconBuilding',
  IconCable: 'IconPlugConnected', IconCakeSlice: 'IconCake', IconCalendar1: 'IconCalendar',
  IconCalendarArrowDown: 'IconCalendarDown', IconCalendarArrowUp: 'IconCalendarUp', IconCalendarCheck2: 'IconCalendarCheck',
  IconCalendarDays: 'IconCalendarMonth', IconCalendarFold: 'IconCalendar', IconCalendarMinus2: 'IconCalendarMinus',
  IconCalendarPlus2: 'IconCalendarPlus', IconCalendarRange: 'IconCalendarWeek', IconCalendars: 'IconCalendar',
  IconCalendarSync: 'IconCalendarRepeat', IconCalendarX2: 'IconCalendarX', IconCarFront: 'IconCar',
  IconCarTaxiFront: 'IconCar', IconCaseLower: 'IconLetterCaseLower', IconCaseSensitive: 'IconLetterCase',
  IconCaseUpper: 'IconLetterCaseUpper', IconCastle: 'IconBuildingCastle', IconChartBarBig: 'IconChartBar',
  IconChartBarDecreasing: 'IconChartBar', IconChartBarIncreasing: 'IconChartBar', IconChartBarStacked: 'IconChartBar',
  IconChartCandlestick: 'IconChartCandle', IconChartColumnBig: 'IconChartBar', IconChartColumnDecreasing: 'IconChartBar',
  IconChartColumnIncreasing: 'IconChartBar', IconChartColumnStacked: 'IconChartBar', IconChartGantt: 'IconTimeline',
  IconChartNetwork: 'IconChartDots3', IconChartNoAxesColumn: 'IconChartBar', IconChartNoAxesColumnDecreasing: 'IconChartBar',
  IconChartNoAxesColumnIncreasing: 'IconChartBar', IconChartNoAxesCombined: 'IconChartLine', IconChartNoAxesGantt: 'IconTimeline',
  IconChartSpline: 'IconChartLine', IconCheckCheck: 'IconChecks', IconCheckLine: 'IconCheck',
  IconChevronsDownUp: 'IconArrowsMinimize', IconChevronsUpDown: 'IconSelector', IconChurch: 'IconBuildingChurch',
  IconCircleAlert: 'IconAlertCircle', IconCircleCheckBig: 'IconCircleCheck', IconCircleDollarSign: 'IconCoinFilled',
  IconCircleDotDashed: 'IconCircleDotted', IconCircleEllipsis: 'IconDots', IconCircleEuro: 'IconCoinEuro',
  IconCircleFadingArrowUp: 'IconCircleArrowUp', IconCircleFadingPlus: 'IconCirclePlus', IconCircleGauge: 'IconGauge',
  IconCircleParking: 'IconParkingCircle', IconCirclePause: 'IconPlayerPause', IconCirclePlay: 'IconPlayerPlay',
  IconCircleSlash: 'IconCircleOff', IconCircleSlash2: 'IconCircleHalf2', IconCircleSmall: 'IconCircle',
  IconCircleStop: 'IconPlayerStop', IconCircleUser: 'IconUserCircle', IconCircleUserRound: 'IconUserCircle',
  IconCircuitBoard: 'IconCpu2', IconCitrus: 'IconLemon2', IconClapperboard: 'IconMovie',
  IconClipboardClock: 'IconClipboard', IconClipboardMinus: 'IconClipboardX', IconClipboardPaste: 'IconClipboardText',
  IconClipboardPen: 'IconClipboardText', IconClipboardPenLine: 'IconClipboardText', IconClipboardType: 'IconClipboardText',
  IconClock1: 'IconClock', IconClock10: 'IconClock', IconClock11: 'IconClock',
  IconClock3: 'IconClock', IconClock4: 'IconClock', IconClock5: 'IconClock',
  IconClock6: 'IconClock', IconClock7: 'IconClock', IconClock8: 'IconClock',
  IconClock9: 'IconClock', IconClockAlert: 'IconClockExclamation', IconClockArrowDown: 'IconClockDown',
  IconClockArrowLeft: 'IconClockPause', IconClockArrowRight: 'IconClockPlay', IconClockArrowUp: 'IconClockUp',
  IconClockFading: 'IconClock', IconCloudAlert: 'IconCloudExclamation', IconCloudDrizzle: 'IconCloudRain',
  IconCloudHail: 'IconCloudSnow', IconCloudLightning: 'IconCloudBolt', IconCloudMoon: 'IconMoonStars',
  IconCloudRainWind: 'IconCloudStorm', IconCloudSun: 'IconSunWind', IconClub: 'IconPlayCard',
  IconCodeXml: 'IconCode', IconCog: 'IconSettings', IconColumns4: 'IconColumns',
  IconComponent: 'IconComponents', IconComputer: 'IconDeviceDesktop', IconConciergeBell: 'IconBellRinging2',
  IconConstruction: 'IconBarrierBlock', IconContact: 'IconAddressBook', IconContactRound: 'IconAddressBook',
  IconCookingPot: 'IconCooker', IconCopySlash: 'IconCopyOff', IconCroissant: 'IconBaguette',
  IconCuboid: 'IconCube', IconCupSoda: 'IconCup', IconDatabaseBackup: 'IconDatabaseImport',
  IconDatabaseCheck: 'IconDatabase', IconDatabaseZap: 'IconDatabaseCog', IconDessert: 'IconIceCream',
  IconDices: 'IconDice', IconDisc2: 'IconDisc', IconDisc3: 'IconDisc',
  IconDiscAlbum: 'IconVinyl', IconDollarSign: 'IconCurrencyDollar', IconDonut: 'IconCookie',
  IconDoorClosed: 'IconDoor', IconDoorOpen: 'IconDoorEnter', IconDraftingCompass: 'IconCompassFilled',
  IconDrama: 'IconMasksTheater', IconDrum: 'IconMusic', IconDrumstick: 'IconMeat',
  IconEarth: 'IconWorld', IconEclipse: 'IconMoon', IconEllipsis: 'IconDots',
  IconEllipsisVertical: 'IconDotsVertical', IconEthernetPort: 'IconPlug', IconEuro: 'IconCurrencyEuro',
  IconExpand: 'IconArrowsMaximize', IconFactory: 'IconBuildingFactory2', IconFan: 'IconPropeller',
  IconFastForward: 'IconPlayerTrackNext', IconFileArchive: 'IconFileZip', IconFileBadge: 'IconFileCertificate',
  IconFileBox: 'IconFile3d', IconFileChartColumn: 'IconFileAnalytics', IconFileChartColumnIncreasing: 'IconFileAnalytics',
  IconFileChartLine: 'IconFileAnalytics', IconFileChartPie: 'IconFileAnalytics', IconFileCheckCorner: 'IconFileCheck',
  IconFileClock: 'IconFileTime', IconFileCodeCorner: 'IconFileCode', IconFileCog: 'IconFileSettings',
  IconFileDown: 'IconFileDownload', IconFileHeart: 'IconFileLike', IconFileImage: 'IconFileTypeJpg',
  IconFileInput: 'IconFileImport', IconFileKey: 'IconFileCertificate', IconFileLock: 'IconFileShredder',
  IconFileMinusCorner: 'IconFileMinus', IconFileOutput: 'IconFileExport', IconFilePen: 'IconFilePencil',
  IconFilePenLine: 'IconFilePencil', IconFilePlay: 'IconVideo', IconFilePlusCorner: 'IconFilePlus',
  IconFileScan: 'IconFileSearch', IconFileSearchCorner: 'IconFileSearch', IconFileSliders: 'IconFileSettings',
  IconFileTerminal: 'IconFileCode', IconFileType: 'IconFileTypography', IconFileUp: 'IconFileUpload',
  IconFileUser: 'IconFileCv', IconFileVolume: 'IconFileMusic', IconFileXCorner: 'IconFileX',
  IconFilm: 'IconMovie', IconFlaskConical: 'IconFlask', IconFlaskRound: 'IconFlask2',
  IconFlipHorizontal2: 'IconFlipHorizontal', IconFlipVertical2: 'IconFlipVertical', IconFlower2: 'IconFlower',
  IconFolderArchive: 'IconFolderBolt', IconFolderClock: 'IconFolderQuestion', IconFolderClosed: 'IconFolder',
  IconFolderDot: 'IconFolderExclamation', IconFolderGit: 'IconFolderCode', IconFolderGit2: 'IconFolderCode',
  IconFolderInput: 'IconFolderDown', IconFolderKanban: 'IconLayoutKanban', IconFolderKey: 'IconFolderQuestion',
  IconFolderLock: 'IconFolderOff', IconFolderOutput: 'IconFolderUp', IconFolderPen: 'IconFolderCog',
  IconFolderSearch2: 'IconFolderSearch', IconFolderSync: 'IconFolderShare', IconFolderTree: 'IconBinaryTree',
  IconFoldHorizontal: 'IconFold', IconFoldVertical: 'IconFoldDown', IconFootprints: 'IconWalk',
  IconForward: 'IconArrowForwardUp', IconFrown: 'IconMoodSad', IconFuel: 'IconGasStation',
  IconFullscreen: 'IconMaximize', IconFunnel: 'IconFilter', IconFunnelPlus: 'IconFilterPlus',
  IconFunnelX: 'IconFilterX', IconGalleryHorizontal: 'IconCarouselHorizontal', IconGalleryThumbnails: 'IconLayoutGrid',
  IconGalleryVertical: 'IconCarouselVertical', IconGamepad: 'IconDeviceGamepad', IconGamepad2: 'IconDeviceGamepad2',
  IconGem: 'IconDiamond', IconGlassWater: 'IconGlassFull', IconGoal: 'IconTarget',
  IconGraduationCap: 'IconSchool', IconGrip: 'IconGridDots', IconGuitar: 'IconGuitarPick',
  IconHand: 'IconHandStop', IconHandCoins: 'IconCoin', IconHandHelping: 'IconHeartHandshake',
  IconHandMetal: 'IconHandRock', IconHandshake: 'IconHeartHandshake', IconHardDrive: 'IconServerBolt',
  IconHardHat: 'IconHelmet', IconHeading1: 'IconHeading', IconHeading2: 'IconHeading',
  IconHeading3: 'IconHeading', IconHeading4: 'IconHeading', IconHeading5: 'IconHeading',
  IconHeading6: 'IconHeading', IconHeadphoneOff: 'IconHeadphonesOff', IconHeartCrack: 'IconHeartBroken',
  IconHeartPulse: 'IconHeartbeat', IconHeater: 'IconFlame', IconHotel: 'IconBuildingSkyscraper',
  IconHouse: 'IconHome', IconHousePlug: 'IconHomeBolt', IconHousePlus: 'IconHomePlus',
  IconHouseWifi: 'IconHomeSignal', IconIdCard: 'IconId', IconImage: 'IconPhoto',
  IconImageDown: 'IconPhotoDown', IconImageMinus: 'IconPhotoMinus', IconImageOff: 'IconPhotoOff',
  IconImagePlus: 'IconPhotoPlus', IconImages: 'IconLibraryPhoto', IconImageUp: 'IconPhotoUp',
  IconImport: 'IconFileImport', IconIndianRupee: 'IconCurrencyRupee', IconInfo: 'IconInfoCircle',
  IconJapaneseYen: 'IconCurrencyYen', IconJoystick: 'IconDeviceGamepad', IconKanban: 'IconLayoutKanban',
  IconKeyboardMusic: 'IconPiano', IconKeyRound: 'IconKey', IconKeySquare: 'IconKey',
  IconLampDesk: 'IconLamp2', IconLandmark: 'IconBuildingBank', IconLanguages: 'IconLanguage',
  IconLaptop: 'IconDeviceLaptop', IconLassoSelect: 'IconLasso', IconLaugh: 'IconMoodHappy',
  IconLayers2: 'IconStackFront', IconLayoutPanelLeft: 'IconLayoutSidebar', IconLayoutPanelTop: 'IconLayoutNavbar',
  IconLeafyGreen: 'IconLeaf', IconLibraryBig: 'IconBooks', IconLightbulb: 'IconBulb',
  IconLightbulbOff: 'IconBulbOff', IconLink2: 'IconLink', IconLink2Off: 'IconLinkOff',
  IconListChecks: 'IconListCheck', IconListEnd: 'IconPlaylistAdd', IconListMusic: 'IconPlaylist',
  IconListOrdered: 'IconListNumbers', IconListPlus: 'IconPlaylistAdd', IconListTodo: 'IconListCheck',
  IconListX: 'IconPlaylistX', IconLoaderCircle: 'IconLoader2', IconLoaderPinwheel: 'IconLoader3',
  IconLocate: 'IconCurrentLocation', IconLocateFixed: 'IconCurrentLocation', IconLocateOff: 'IconCurrentLocationOff',
  IconLockKeyhole: 'IconLock', IconLockKeyholeOpen: 'IconLockOpen', IconLogIn: 'IconLogin',
  IconLogOut: 'IconLogout', IconMailQuestionMark: 'IconMailQuestion', IconMailWarning: 'IconMailExclamation',
  IconMapPinned: 'IconMapPin2', IconMartini: 'IconGlassCocktail', IconMaximize2: 'IconMaximize',
  IconMegaphone: 'IconSpeakerphone', IconMegaphoneOff: 'IconSpeakerphone', IconMeh: 'IconMoodEmpty',
  IconMemoryStick: 'IconUsb', IconMessageCircleMore: 'IconMessageDots', IconMessageCircleQuestionMark: 'IconMessageCircleQuestion',
  IconMessageCircleReply: 'IconMessageCircleShare', IconMessageCircleWarning: 'IconMessageCircleExclamation', IconMessageSquareDot: 'IconMessageCircleExclamation',
  IconMessageSquareMore: 'IconMessageDots', IconMessageSquareQuote: 'IconQuote', IconMessageSquareReply: 'IconMessageShare',
  IconMessageSquareText: 'IconMessage2', IconMessageSquareWarning: 'IconMessageExclamation', IconMessagesSquare: 'IconMessages',
  IconMic: 'IconMicrophone', IconMicOff: 'IconMicrophoneOff', IconMicVocal: 'IconMicrophoneFilled',
  IconMilestone: 'IconRoadSign', IconMinimize2: 'IconMinimize', IconMonitor: 'IconDeviceDesktop',
  IconMonitorCheck: 'IconDeviceDesktopCheck', IconMonitorCog: 'IconDeviceDesktopCog', IconMonitorDot: 'IconDeviceDesktopExclamation',
  IconMonitorDown: 'IconDeviceDesktopDown', IconMonitorOff: 'IconDeviceDesktopOff', IconMonitorPause: 'IconDeviceDesktopPause',
  IconMonitorPlay: 'IconDeviceDesktopShare', IconMonitorSmartphone: 'IconDevices', IconMonitorSpeaker: 'IconDeviceSpeaker',
  IconMonitorUp: 'IconDeviceDesktopUp', IconMonitorX: 'IconDeviceDesktopX', IconMoonStar: 'IconMoonStars',
  IconMountainSnow: 'IconMountain', IconMousePointer: 'IconPointer', IconMousePointer2: 'IconPointer',
  IconMousePointerClick: 'IconClick', IconMove: 'IconArrowsMove', IconMove3d: 'IconArrowsMove',
  IconMoveDiagonal: 'IconArrowsDiagonal', IconMoveDiagonal2: 'IconArrowsDiagonal2', IconMoveHorizontal: 'IconArrowsHorizontal',
  IconMoveVertical: 'IconArrowsVertical', IconMusic2: 'IconMusic', IconMusic3: 'IconMusic',
  IconMusic4: 'IconMusic', IconNavigation2: 'IconNavigationFilled', IconNewspaper: 'IconNews',
  IconNotebookPen: 'IconNotebook', IconNotebookTabs: 'IconNotebook', IconNotebookText: 'IconNotebook',
  IconOctagonAlert: 'IconAlertOctagon', IconOctagonPause: 'IconPlayerPauseFilled', IconOctagonX: 'IconXboxX',
  IconOrbit: 'IconPlanet', IconPackage2: 'IconPackage', IconPackageOpen: 'IconPackageImport',
  IconPaintbrush: 'IconBrush', IconPaintBucket: 'IconBucketDroplet', IconPaintRoller: 'IconPaintFilled',
  IconPanelBottom: 'IconLayoutBottombar', IconPanelLeft: 'IconLayoutSidebar', IconPanelRight: 'IconLayoutSidebarRight',
  IconPanelTop: 'IconLayoutNavbar', IconPartyPopper: 'IconConfetti', IconPause: 'IconPlayerPause',
  IconPawPrint: 'IconPaw', IconPcCase: 'IconDeviceDesktopAnalytics', IconPen: 'IconPencil',
  IconPencilLine: 'IconPencil', IconPencilRuler: 'IconRuler2', IconPenLine: 'IconPencil',
  IconPercent: 'IconPercentage', IconPersonStanding: 'IconMan', IconPi: 'IconMathPi',
  IconPickaxe: 'IconPick', IconPictureInPicture2: 'IconPictureInPicture', IconPiggyBank: 'IconPigMoney',
  IconPinOff: 'IconPinnedOff', IconPipette: 'IconColorPicker', IconPlaneLanding: 'IconPlaneArrival',
  IconPlaneTakeoff: 'IconPlaneDeparture', IconPlay: 'IconPlayerPlay', IconPlug2: 'IconPlug',
  IconPlugZap: 'IconBoltOff', IconPocketKnife: 'IconSlice', IconPopcorn: 'IconBucket',
  IconPopsicle: 'IconIceCream2', IconPoundSterling: 'IconCurrencyPound', IconPowerOff: 'IconPlugOff',
  IconPrinterCheck: 'IconPrinter', IconProjector: 'IconDeviceProjector', IconProportions: 'IconAspectRatio',
  IconQrCode: 'IconQrcode', IconRabbit: 'IconDeer', IconRadical: 'IconMathSymbols',
  IconRadioTower: 'IconBroadcastOff', IconRat: 'IconDeer', IconReceiptCent: 'IconReceipt2',
  IconReceiptIndianRupee: 'IconReceiptRupee', IconReceiptJapaneseYen: 'IconReceiptYen', IconReceiptPoundSterling: 'IconReceiptPound',
  IconReceiptRussianRuble: 'IconReceipt', IconReceiptSwissFranc: 'IconReceipt', IconReceiptText: 'IconReceipt',
  IconRectangleCircle: 'IconCircleRectangle', IconRedo: 'IconArrowForwardUp', IconRedo2: 'IconArrowForwardUp',
  IconRefreshCcw: 'IconRefresh', IconRefreshCcwDot: 'IconRefresh', IconRefreshCw: 'IconRefresh',
  IconRefreshCwOff: 'IconRefreshOff', IconRefrigerator: 'IconFridge', IconRemoveFormatting: 'IconClearFormatting',
  IconRepeat1: 'IconRepeatOnce', IconRepeat2: 'IconRepeat', IconReply: 'IconArrowBackUp',
  IconReplyAll: 'IconArrowsLeft', IconRewind: 'IconPlayerTrackPrev', IconRotateCcw: 'IconRotate',
  IconRotateCw: 'IconRotateClockwise', IconRows2: 'IconLayoutRows', IconRows3: 'IconLayoutList',
  IconSandwich: 'IconBread', IconSatelliteDish: 'IconSatelliteOff', IconSave: 'IconDeviceFloppy',
  IconSaveAll: 'IconDeviceFloppy', IconScale3d: 'IconScale', IconScanBarcode: 'IconScan',
  IconScanFace: 'IconFaceId', IconScanLine: 'IconScan', IconScanQrCode: 'IconQrcode',
  IconScanSearch: 'IconZoomScan', IconSendHorizontal: 'IconSend', IconSendToBack: 'IconStackBack',
  IconServerCrash: 'IconServerOff', IconSheet: 'IconTable', IconShell: 'IconSpiral',
  IconShieldAlert: 'IconShieldExclamation', IconShieldBan: 'IconShieldOff', IconShieldCogCorner: 'IconShieldCog',
  IconShieldEllipsis: 'IconShieldQuestion', IconShieldQuestionMark: 'IconShieldQuestion', IconShieldUser: 'IconUserShield',
  IconShoppingBasket: 'IconShoppingCart', IconShowerHead: 'IconDroplets', IconShrink: 'IconArrowsMinimize',
  IconShuffle: 'IconArrowsShuffle', IconSigma: 'IconMathSymbols', IconSignal: 'IconAntenna',
  IconSignalHigh: 'IconAntennaBars5', IconSignalLow: 'IconAntennaBars3', IconSignalMedium: 'IconAntennaBars4',
  IconSignalZero: 'IconAntennaBars1', IconSignpost: 'IconDirections', IconSignpostBig: 'IconDirections',
  IconSiren: 'IconAlertSquareRounded', IconSkipBack: 'IconPlayerSkipBack', IconSkipForward: 'IconPlayerSkipForward',
  IconSlidersHorizontal: 'IconAdjustmentsHorizontal', IconSlidersVertical: 'IconAdjustments', IconSmartphone: 'IconDeviceMobile',
  IconSmile: 'IconMoodSmile', IconSmilePlus: 'IconMoodPlus', IconSnail: 'IconSeeding',
  IconSpeech: 'IconMessageCircle', IconSpellCheck: 'IconTextSpellcheck', IconSpellCheck2: 'IconTextSpellcheck',
  IconSprout: 'IconSeedling', IconSquareActivity: 'IconActivity', IconSquareArrowOutDownLeft: 'IconArrowDownLeft',
  IconSquareArrowOutDownRight: 'IconArrowDownRight', IconSquareArrowOutUpLeft: 'IconArrowUpLeft', IconSquareArrowOutUpRight: 'IconExternalLink',
  IconSquareCheckBig: 'IconCheckbox', IconSquareCode: 'IconCode', IconSquareKanban: 'IconLayoutKanban',
  IconSquareMenu: 'IconMenu2', IconSquarePen: 'IconEdit', IconSquareRadical: 'IconMathSymbols',
  IconSquareSlash: 'IconSquareOff', IconSquareTerminal: 'IconTerminal2', IconSquareUser: 'IconUserSquare',
  IconSquareUserRound: 'IconUserSquareRounded', IconSquirrel: 'IconDeer', IconStamp: 'IconRubberStamp',
  IconStepBack: 'IconPlayerSkipBack', IconStepForward: 'IconPlayerSkipForward', IconStickyNote: 'IconNote',
  IconStore: 'IconBuildingStore', IconSunDim: 'IconSunLow', IconSunMedium: 'IconSunLow',
  IconSyringe: 'IconVaccine', IconTable2: 'IconTable', IconTablet: 'IconDeviceTablet',
  IconTablets: 'IconPills', IconTabletSmartphone: 'IconDeviceMobile', IconTentTree: 'IconTent',
  IconTestTube: 'IconTestPipe', IconTestTubes: 'IconTestPipe2', IconTextCursor: 'IconCursorText',
  IconTextCursorInput: 'IconCursorText', IconTextQuote: 'IconQuote', IconTextSearch: 'IconListSearch',
  IconThermometerSnowflake: 'IconTemperatureSnow', IconThermometerSun: 'IconTemperatureSun', IconThumbsDown: 'IconThumbDown',
  IconThumbsUp: 'IconThumbUp', IconTicketCheck: 'IconTicket', IconTimer: 'IconStopwatch',
  IconTimerOff: 'IconClockOff', IconTimerReset: 'IconClockUp', IconTorus: 'IconCircles',
  IconTrainFront: 'IconTrain', IconTramFront: 'IconBusStop', IconTrash2: 'IconTrash',
  IconTreeDeciduous: 'IconTree', IconTreePine: 'IconChristmasTree', IconTriangleAlert: 'IconAlertTriangle',
  IconTruckElectric: 'IconTruck', IconTurtle: 'IconPaw', IconTv: 'IconDeviceTv',
  IconType: 'IconTypography', IconTypeOutline: 'IconTypography', IconUndo: 'IconArrowBackUp',
  IconUndo2: 'IconArrowBackUp', IconUnfoldHorizontal: 'IconArrowsHorizontal', IconUnfoldVertical: 'IconArrowsVertical',
  IconUniversity: 'IconBuildingBank', IconUnlink2: 'IconUnlink', IconUnplug: 'IconPlugOff',
  IconUserPen: 'IconUserEdit', IconUserRound: 'IconUser', IconUserRoundCheck: 'IconUserCheck',
  IconUserRoundCog: 'IconUserCog', IconUserRoundKey: 'IconUserKey', IconUserRoundMinus: 'IconUserMinus',
  IconUserRoundPen: 'IconUserEdit', IconUserRoundPlus: 'IconUserPlus', IconUserRoundSearch: 'IconUserSearch',
  IconUserRoundX: 'IconUserX', IconUsersRound: 'IconUsers', IconUtensils: 'IconToolsKitchen2',
  IconUtensilsCrossed: 'IconToolsKitchen3', IconUtensilsFork: 'IconToolsKitchen2', IconUtensilsOff: 'IconToolsKitchen2Off',
  IconVault: 'IconLockSquareRounded', IconVegan: 'IconLeaf', IconVenetianMask: 'IconMask',
  IconVideotape: 'IconVideo', IconVoicemail: 'IconPhoneCall', IconVolume1: 'IconVolume2',
  IconVolumeX: 'IconVolumeOff', IconVote: 'IconCheckbox', IconWalletCards: 'IconCreditCardPay',
  IconWandSparkles: 'IconWand', IconWarehouse: 'IconBuildingWarehouse', IconWashingMachine: 'IconWashMachine',
  IconWatch: 'IconDeviceWatch', IconWebcam: 'IconDeviceComputerCamera', IconWholeWord: 'IconLetterCase',
  IconWifiHigh: 'IconWifi2', IconWifiLow: 'IconWifi1', IconWifiZero: 'IconWifi0',
  IconWine: 'IconGlass', IconWineOff: 'IconGlassOff', IconWorkflow: 'IconSitemap',
  IconWorm: 'IconSeeding', IconWrench: 'IconTool', IconZap: 'IconBolt',
  IconZapOff: 'IconBoltOff',
};

// ── Resolve the real exported icon names ──────────────────────────────────
const PKG = 'node_modules/@tabler/icons-react';
const DTS_CANDIDATES = [
  'dist/tabler-icons-react.d.ts',
  'dist/esm/tabler-icons-react.d.ts',
  'dist/index.d.ts',
  'dist/esm/index.d.ts',
  'dist/types/index.d.ts',
  'dist/esm/tabler-icons-react.js',
  'dist/cjs/tabler-icons-react.js',
].map(p => join(PKG, p));

function loadValidNames() {
  for (const p of DTS_CANDIDATES) {
    if (!existsSync(p)) continue;
    const src = readFileSync(p, 'utf8');
    const names = new Set();
    // Any `Icon<Capital>…` token in the declarations/barrel is a real export.
    // Greedy on purpose: a stray match only WIDENS the valid set (fewer false
    // positives) — it can never reject a genuinely-exported name.
    const re = /\bIcon[A-Z]\w*/g;
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[0]);
    if (names.size > 100) return names; // sanity: the real list is in the thousands
  }
  return null;
}

const valid = loadValidNames();
if (!valid) {
  console.log('check-icons: SKIP (could not resolve @tabler/icons-react export names — tsc will catch icon errors)');
  process.exit(0);
}

// ── Scan agent-written sources for @tabler/icons-react imports ────────────
const ROOTS = ['src/pages', 'src/components'];
const SKIP = /\.example\.tsx$|[\\/]ui[\\/]/;

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const errors = [];
let healed = 0;
const files = ROOTS.flatMap(r => walk(r)).filter(f => !SKIP.test(f));
// `[^}]*` spans newlines (multiline imports are common) since `}` ends the clause.
const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@tabler\/icons-react['"]/g;

for (const file of files) {
  let src = readFileSync(file, 'utf8');
  // Collect invalid imported names (with the line of their import clause).
  const invalid = new Map(); // name → lineNo
  let im;
  IMPORT_RE.lastIndex = 0;
  while ((im = IMPORT_RE.exec(src)) !== null) {
    const lineNo = src.slice(0, im.index).split('\n').length;
    for (const raw of im[1].split(',')) {
      // strip aliases (`IconFoo as Bar`) and whitespace — the imported name is the left side
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name || !/^Icon[A-Z]/.test(name)) continue;
      if (!valid.has(name) && !invalid.has(name)) invalid.set(name, lineNo);
    }
  }
  if (!invalid.size) continue;

  const healable = [...invalid.keys()].filter(n => ALIASES[n] && valid.has(ALIASES[n]));
  if (healable.length) {
    for (const n of healable) {
      src = src.replace(new RegExp(`\\b${n}\\b`, 'g'), ALIASES[n]);
      console.log(`[check-icons] healed '${n}' → '${ALIASES[n]}' (${file})`);
      healed++;
    }
    // A heal can collide with an already-imported target — dedupe the
    // specifiers of every @tabler import clause in the healed file.
    src = src.replace(IMPORT_RE, (full, inner) => {
      const seen = new Set();
      const parts = inner.split(',').map(s => s.trim()).filter(Boolean).filter(p => {
        if (seen.has(p)) return false;
        seen.add(p);
        return true;
      });
      return full.replace(inner, '\n  ' + parts.join(',\n  ') + ',\n');
    });
    writeFileSync(file, src);
  }

  for (const [name, lineNo] of invalid) {
    if (healable.includes(name)) continue;
    errors.push(`${file}:${lineNo}: '${name}' is not exported by @tabler/icons-react — pick a different, existing Tabler icon.`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} non-existent icon import(s) — every icon must be a real @tabler/icons-react export. Replace each with an existing one.`);
  process.exit(1);
}
console.log(`check-icons: OK (${files.length} files scanned, ${valid.size} valid names, ${healed} healed)`);
