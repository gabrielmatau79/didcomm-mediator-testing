import { registerAs } from '@nestjs/config'

/**
 * Configuration for the application, including ports, database URIs, and service URLs.
 *
 * @returns {object} - An object containing the configuration settings for the application.
 */
export default registerAs('appConfig', () => ({
  /**
   * The port number on which the application will run.
   * Defaults to 3500 if APP_PORT is not set in the environment variables.
   * @type {number}
   */
  appPort: parseInt(process.env.APP_PORT, 10) || 3001,

  /**
   * Defaults to a specified local Redis instance if REDIS_URL is not set in the environment variables.
   * @type {string}
   */
  redisDbUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  /**
   * Define DID:WEB to connect and Configure Agents
   */
  publicDid: process.env.AGENT_PUBLIC_DID || 'did:web:ca.dev.2060.io',

  /**
   * Configure Log Level of the aplication
   */

  LogLevel: process.env.LOG_LEVEL || 1,
}))
