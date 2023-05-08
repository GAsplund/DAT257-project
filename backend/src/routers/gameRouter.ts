import { Router } from 'express';
import { z } from 'zod';
import { validateRequestBody } from 'zod-express-middleware';
import { getAccountFromCid } from '../services/accountService.js';
import {
	getGameOwnerIdFromCid,
	getGameOwnerNameFromId,
	getGameOwnersWithGames
} from '../services/gameOwnerService.js';
import {
	Filter,
	createGame,
	filterGames,
	getAllGames,
	searchGames,
	removeGame,
	markGameAsPlayed,
	markGameAsNotPlayed
} from '../services/gameService.js';
import { platformExists } from '../services/platformService.js';
import sendApiValidationError from '../utils/sendApiValidationError.js';
import { getAverageRating, getUserRating } from '../services/ratingService.js';
import { GammaUser } from '../models/gammaModels.js';

const gameRouter = Router();

/**
 * @api {get} /api/v1/games Request Games
 * @apiName GetGames
 * @apiGroup Games
 * @apiDescription Get all public games
 *
 * @apiSuccess {Object[]} games List of games
 *
 * @apiSuccessExample Success-Response:
 *  HTTP/1.1 200 OK
 *  [
 *   {
 *    "id": "clgkri8kk0000przwvkvbyj95",
 *    "name": "Game 1",
 *    "description": "Game 1 description",
 * 	  "platformName": "Steam",
 *	  "releaseDate": "2023-04-13T00:00:00.000Z",
 *	  "playtime": 60,
 *	  "playerMin": 1,
 *	  "playerMax": 5
 *	  "location": "Hubben",
 * 	"isBorrowed": "false"
 *   }
 * ]
 */
gameRouter.get('/', async (req, res) => {
	const games = await getAllGames();
	const formattedGames = await formatGames(games, req.isAuthenticated() ? req.user as GammaUser : null);
	res.status(200).json(formattedGames);
});

const addGameSchema = z.object({
	name: z.string().min(1).max(250),
	description: z.string().min(1).max(2000),
	platform: z.string().min(1),
	releaseDate: z.string().datetime(), // ISO date string
	playtime: z.number().int().min(1),
	playerMin: z.number().int().min(1),
	playerMax: z.number().int().min(1), //Maybe check that max > min?
	location: z.string().min(1).max(250)
});

/**
 * @api {get} /api/v1/games/search Search Games
 * @apiName SearchGames
 * @apiGroup Games
 * @apiDescription Get all public games that includes the search term
 *
 * @apiQuery {String} term Search term
 *
 * @apiSuccess {Object[]} games List of games
 *
 * @apiSuccessExample Success-Response:
 *  HTTP/1.1 200 OK
 *  [
 *   {
 *    "id": "clgkri8kk0000przwvkvbyj95",
 *    "name": "Game 1",
 *    "description": "Game 1 description",
 * 	  "platformName": "Steam",
 *	  "releaseDate": "2023-04-13",
 *	  "playtimeMinutes": "60",
 *	  "location": "Hubben"
 *   }
 * ]
 */
gameRouter.get('/search', async (req, res) => {
	const games = await searchGames(
		typeof req.query.term === 'string' ? req.query.term : ''
	);

	const formattedGames = await formatGames(games, req.isAuthenticated() ? req.user as GammaUser : null);

	res.status(200).json(formattedGames);
});

/**
 * @api {post} /api/v1/games/add Add a game
 * @apiName AddGame
 * @apiGroup Games
 * @apiDescription Adds a game to the service
 *
 * @apiBody {String} name Name of the game
 * @apiBody {String} description Description of the game
 * @apiBody {String} platform Platform the game is played on
 * @apiBody {String} releaseDate Date the game was released
 * @apiBody {Number} playtime Playtime of the game
 * @apiBody {Number} playerMin PlayerMin of the game
 * @apiBody {Number} playMax PlayerMax of the game
 * @apiBody {String} location Location of the game
 *
 * @apiSuccess {String} message Message indicating success
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 * {
 * 	"message": "Game added"
 * }
 *
 * @apiUse ZodError
 *
 * @apiError (401) {object} Unauthorized Must be logged in to add game
 * @apiErrorExample {json} 401 Unauthorized:
 * {
 * 	"message": "Must be logged in to add game"
 * }
 * @apiErrorExample {json} 400 Bad Request:
 * {
 * 	"message": "Something went wrong adding the game"
 * }
 * @apiErrorExample {json} 500 Internal Server Error:
 * {
 * 	"message": "Internal server error or something"
 * }
*/
gameRouter.post(
	'/add',
	validateRequestBody(addGameSchema),
	async (req, res) => {
		try {
			if (!req.user) {
				return res.status(401).json({ message: 'Must be logged in to add game' });
			}

			const body = req.body;

			if (!(await platformExists(body.platform))) {
				return sendApiValidationError(
					res,
					{
						path: 'platform',
						message: 'Platform does not exist'
					},
					'Body'
				);
			}

			await createGame(
				body.name,
				body.description,
				body.platform,
				new Date(body.releaseDate),
				body.playtime,
				body.playerMin,
				body.playerMax,
				body.location,
				// @ts-expect-error GammaUser not added to Request.user type
				await getGameOwnerIdFromCid(req.user.cid)
			);

			res.status(200).json({ message: 'Game added' });
		} catch (e) {
			if (e instanceof Error) {
				res.status(400).json({ message: "Something went wrong adding the game" });
			} else {
				res.status(500).json({ message: "Uwu oopsie woopsie, the devs made a fucky wucky! Sowwy" });
			}
		}
	}
);

const filterGamesSchema = z.object({
	name: z.string().min(1).max(500).optional(),
	platform: z.string().min(1).optional(),
	releaseBefore: z.string().datetime().optional(), // ISO date string
	releaseAfter: z.string().datetime().optional(), // ISO date string
	playtimeMin: z.number().int().min(1).optional(),
	playtimeMax: z.number().int().min(1).optional(),
	playerCount: z.number().int().min(1).max(2000).optional(),
	owner: z.string().cuid2().optional(),
	location: z.string().min(1).max(500).optional()
});

/**
 * @api {post} /api/v1/games/filter Filter which games to show
 * @apiName Filter
 * @apiGroup Games
 * @apiDescription Filters the games returned
 *
 * @apiBody {String} name Name of the game (Optional)
 * @apiBody {String} description Description of the game (Optional)
 * @apiBody {String} platform Platform the game is played on (Optional)
 * @apiBody {String} releaseBefore Filters to games released before a specific date (Optional)
 * @apiBody {String} releaseAfter Filters to games released after a specific date (Optional)
 * @apiBody {Number} playtimeMin Minimum playtime of the game (Optional)
 * @apiBody {Number} playtimeMax Maximum playtime of the game (Optional
 * @apiBody {Number} playerCount amount of players for the game (Optional)
 * @apiBody {String} owner CUID of the owner of the game (Optional)
 * @apiBody {String} location Location of the game (Optional)
 *
 * @apiSuccess {String} message Message indicating success
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 *  [
 *   {
 *    "id": "clgkri8kk0000przwvkvbyj95",
 *    "name": "Game 1",
 *    "description": "Game 1 description",
 * 	  "platformName": "Steam",
 *	  "releaseDate": "2023-04-13",
 *	  "playtimeMin": "10",
 *	  "playtimeMax": "60"
 *	  "location": "Hubben"
 *   }
 * ]
 *
 * @apiUse ZodError
 */

gameRouter.post(
	'/filter',
	validateRequestBody(filterGamesSchema),
	async (req, res) => {
		const body = req.body;
		const filter: Filter = {};
		if (body.name) {
			filter.name = { contains: body.name, mode: 'insensitive' };
		}
		if (body.releaseAfter)
			filter.dateReleased = {
				gte: new Date(body.releaseAfter)
			};
		if (body.releaseBefore)
			filter.dateReleased = {
				lte: new Date(body.releaseBefore)
			};
		if (body.releaseAfter && body.releaseBefore)
			filter.dateReleased = {
				lte: new Date(body.releaseBefore),
				gte: new Date(body.releaseAfter)
			};
		if (body.playerCount) {
			filter.playerMax = { gte: body.playerCount };
			filter.playerMin = { lte: body.playerCount };
		}
		if (body.platform) filter.platform = { name: body.platform };
		if (body.playtimeMax || body.playtimeMin) {
			filter.playtimeMinutes = {};
			if (body.playtimeMax) filter.playtimeMinutes.lte = body.playtimeMax;
			if (body.playtimeMin) filter.playtimeMinutes.gte = body.playtimeMin;
		}

		if (body.location)
			filter.location = { contains: body.location, mode: 'insensitive' };

		const games = await filterGames(filter);

		const formattedGames = await formatGames(games, req.isAuthenticated() ? req.user as GammaUser : null);
		if (req.user) {
			const uid = (await getAccountFromCid((req.user as GammaUser).cid))?.id;
			for (let i = 0; i < formattedGames.length; i++) {
				formattedGames[i].isPlayed = games[i].playStatus.filter((played) => {
					return played.userId == uid;
				}).length > 0
			}
		}

		res.status(200).json(formattedGames);
	}
);

/**
 * @api {post} /api/v1/games/remove Remove a game
 * @apiName Remove
 * @apiGroup Games
 * @apiDescription Remove a game
 *
 * @apiBody {String} id
 *
 * @apiSuccess {String} message Message indicating success
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 *  [
 *   {
 *    "id": "clgkri8kk0000przwvkvbyj95",
 *   }
 * ]
 *
 * @apiUse ZodError
 * @apiErrorExample {json} 401 Unauthorized:
 * {
 * 	"message": "Must be logged in to remove game"
 * }
*/
gameRouter.post('/remove', async (req, res) => {
	try {
		if (!req.user) { res.status(401).json({ message: 'Must be logged in to remove game' }); return; }
		await removeGame(req.body.id, await getGameOwnerIdFromCid((req.user as GammaUser).cid));
		res.status(200).json({ message: 'Game removed' });
	} catch (e) {
		if (e instanceof Error) res.status(400).json({ message: e.message });
		else res.status(400).json({ message: 'Error removing game' });
	}
});

/**
 * @api {post} /api/v1/games/markPlayed Saves that a user has played a game
 * @apiName markPlayed
 * @apiGroup Games
 * @apiDescription Marks the game as played for the user
 *
 * @apiBody {String} gameId Id of the game
 * @apiBody {String} userId Id of the user
 *
 * @apiSuccess {String} message Message indicating success
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 *   {
 *    "message": "Game marked as played"
 *   }
 *
 * @apiErrorExample {json} Unauthorized:
 * HTTP/1.1 401 Unauthorized
 *   {
 *    "message": "Unauthorized"
 *   }
 *
 * @apiErrorExample {json} Internal server Error:
 * HTTP/1.1 500 Internal server error
 *   {
 *    "message": "Error marking game as not played"
 *   }
 * @apiUse ZodError
 */
gameRouter.post('/markPlayed', async (req, res) => {
	try {
		if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
		await markGameAsPlayed(req.body.gameId, (req.user as GammaUser).cid);
		res.status(200).json({ message: 'Game marked as played' });
	} catch (e) {
		if (e instanceof Error)
			res.status(500).json({ message: e.message });
		else
			res.status(500).json({ message: 'Error marking game as played' });
	}
});

/**
 * @api {post} /api/v1/games/markNotPlayed Saves that a user has played a game
 * @apiName markPlayed
 * @apiGroup Games
 * @apiDescription Marks the game as played for the user
 *
 * @apiBody {String} gameId Id of the game
 * @apiBody {String} userId Id of the user
 *
 * @apiSuccess {String} message Message indicating success
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 *   {
 *    "message": "Game marked as not played"
 *   }
 * @apiErrorExample {json} Unauthorized:
 * HTTP/1.1 401 Unauthorized
 *   {
 *    "message": "Unauthorized"
 *   }
 *
 * @apiErrorExample {json} Internal server Error:
 * HTTP/1.1 500 Internal server error
 *   {
 *    "message": "Error marking game as not played"
 *   }
 *
 * @apiUse ZodError
 */
gameRouter.post('/markNotPlayed', async (req, res) => {
	try {
		if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
		await markGameAsNotPlayed(req.body.gameId, (req.user as GammaUser).cid);
		res.status(200).json({ message: 'Game marked as not played' });
	} catch (e) {
		if (e instanceof Error)
			res.status(500).json({ message: e.message });
		else
			res.status(500).json({ message: 'Error marking game as not played' });
	}
});



/**
 * @api {get} /api/v1/games/owners Get all game owners
 * @apiName GetOwners
 * @apiGroup Games
 * @apiDescription Gets all game owners
 *
 * @apiSuccess {Object[]} Owners List of game owners
 *
 * @apiSuccessExample Success-Response:
 * HTTP/1.1 200 OK
 * [
 *  {
 *   "id": "clgkri8kk0000przwvkvbyj95",
 *   "name": "Game Owner 1"
 *  },
 *  {
 *   "id": "clgkri8ku0000przwvkvbyj95",
 *   "name": "Game Owner 2"
 *  }
 * ]
 **/
gameRouter.get('/owners', async (req, res) => {
	const owners = await getGameOwnersWithGames();

	const formattedOwners = await Promise.all(
		owners.map(async (owner) => ({
			id: owner.id,
			name: await getGameOwnerNameFromId(owner.id)
		}))
	);

	res.status(200).json(formattedOwners);
});

const formatGames = async (games: any[], user: GammaUser | null) => {
	return await Promise.all(
		games.map(async (game) => ({
			id: game.id,
			name: game.name,
			description: game.description,
			platformName: game.platformName,
			releaseDate: game.dateReleased.toISOString().split('T')[0], // `toISOString()` returns a string in the format `YYYY-MM-DDTHH:mm:ss.sssZ`, we only want the date
			playtimeMinutes: game.playtimeMinutes,
			playerMin: game.playerMin,
			playerMax: game.playerMax,
			location: game.location,
			owner: await getGameOwnerNameFromId(game.gameOwnerId),
			isBorrowed:
				game.borrow.filter((b: { returned: boolean }) => {
					return !b.returned;
				}).length > 0,
			ratingAvg: await getAverageRating(game.id),
			ratingUser: user ? await getUserRating(game.id, user.cid) : null,
			isPlayed: false
		}))
	);
};


export default gameRouter;
