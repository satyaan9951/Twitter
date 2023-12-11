const express = require('express')
const app = express()
app.use(express.json())

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DBError :${error.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const tweetAccesVerification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower ON tweet.user_id=follower.following_user_id WHERE tweet.tweet_id='${tweetId}' AND follower_user_id='${userId}';`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

const getFollowingPeopleIdsOfUser = async username => {
  const getUserIdsQuery = `SELECT following_user_id 
  FROM user INNER JOIN follower ON user.user_id =follower.follower_user_id 
  WHERE user.username='${username}';`
  const followingUser = await db.all(getUserIdsQuery)
  const arrayOfIds = followingUser.map(eachUser => {
    eachUser.following_user_id
  })
  return arrayOfIds
}

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
    if (jwtToken === undefined) {
      response.status(401)
      response.send('Invalid JWT Token')
    } else {
      jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
        if (error) {
          response.status(401)
          response.send('Invalid JWT Token')
        } else {
          request.payload = payload
          request.tweetId = tweetId
          request.tweet = tweet
          next()
        }
      })
    }
  }
}
//API1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const newUser = `INSERT INTO 
      user( name, username, password, gender) VALUES('${name}', '${username}',  '${hashedPassword}', '${gender}');`
      await db.run(newUser)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
//API2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched) {
      const jwtToken = jwt.sign(dbUser, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
      console.log(jwtToken)
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(username)
  const getLatestTweetsQuery = `
    SELECT username,tweet,date_time AS dateTime 
    FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user user.user_id=follower.following_user_id
    WHERE follower.follower.user_id=${user_id}
    ORDER BY date_time DESC 
    LIMIT 4;`
  const tweets = await db.all(getLatestTweetsQuery)
  response.send(tweets)
})

//API4
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const getUserFollowingQuery = `
  SELECT name FROM user INNER JOIN follower ON user.user_id=follower.user_id WHERE follower.follower_user_id =${userId};`
  const names = await db.all(getUserFollowingQuery)
  response.send(names)
})

//API5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username, userId} = request
  const getUserFollowingQuery = `
  SELECT DISTINCT name FROM user INNER JOIN follower ON user.user_id=follower.user_id WHERE following_user_id =${userId};`
  const names = await db.all(getUserFollowingQuery)
  response.send(names)
})

//API6
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetAccesVerification,
  async (request, response) => {
    const {username, userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `(SELECT COUNT() FROM like WHERE tweet_id='${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id='${tweetId}') AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE tweet.tweet_id='${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    response.send(tweet)
  },
)

//API7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAccesVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getLikesQuery = `SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id WHERE tweet_id='${tweetId}';`
    const likedUsers = await db.all(getLikesQuery)
    const usersArray = likedUsers.map(eachUser => {
      eachUser.username
    })
    response.send({likes: usersArray})
  },
)

//API8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  tweetAccesVerification,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliedQuery = `SELECT name,reply FROM user INNER JOIN reply ON user.user_id=reply.user_id WHERE tweet_id='${tweetId}';`
    const repliedUsers = await db.all(getRepliedQuery)
    response.send({replies: repliedUsers})
  },
)

//API9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `SELECT tweet,COUNT(DISTINCT like_id) AS likes,COUNT(DISTINCT reply_id) AS replies,date_time AS dateTime
  FROM tweet LEFT JOIN reply ON tweet.tweet_id=reply.tweet_id LEFT JOIN like ON tweet.tweet_id=like.tweet_id
  WHERE tweet.user_id=${userId}
  GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getTweetQuery)
  response.send(tweets)
})

//API10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')
  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES('${tweet}','${userId}','${dateTime}');`
  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {userId} = request
    const getTweetQuery = `SELECT * FROM tweet WHERE user_id='${userId} AND tweet_id='${tweetId}';`
    const tweet = await db.get(getTweetQuery)
    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id='${tweetId}';`
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    }
  },
)
module.exports = app
