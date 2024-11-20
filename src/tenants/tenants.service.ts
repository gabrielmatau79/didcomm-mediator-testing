import { Injectable, Logger } from '@nestjs/common'
import { Agent } from '@credo-ts/core'
import { AgentFactory } from '../lib/agents/agent.factory'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'

@Injectable()
export class TenantsService {
  private tenants: Record<string, { agent: Agent<any> }> = {}
  private readonly logger = new Logger(TenantsService.name)

  constructor(
    private readonly agentFactory: AgentFactory,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  /**
   * Creates a new tenant with the specified configuration.
   * @param tenantId The unique ID of the tenant.
   * @param config The configuration settings for the tenant.
   * @returns An object containing the creation status.
   * @throws Error if the tenant already exists.
   */
  async createTenant(tenantId: string): Promise<{ status: string }> {
    if (this.tenants[tenantId]) {
      this.logger.error(`[createTenant] Tenant ${tenantId} already exists`)
      throw new Error(`[createTenant] Tenant ${tenantId} already exists`)
    }

    const agent = await this.agentFactory.createAgent(tenantId)
    this.tenants[tenantId] = { agent }
    this.logger.log(`[createTenant] Tenant ${tenantId} created successfully`)
    return { status: `Tenant ${tenantId} created successfully` }
  }

  /**
   * Retrieves the agent associated with a specific tenant.
   * @param tenantId The unique ID of the tenant.
   * @returns The agent instance.
   * @throws Error if the tenant does not exist.
   */
  getTenantAgent(tenantId: string): Agent<any> {
    if (!this.tenants[tenantId]) {
      this.logger.error(`[getTenantAgent] Tenant ${tenantId} not found`)
      throw new Error(`[getTenantAgent] Tenant ${tenantId} not found`)
    }
    return this.tenants[tenantId].agent
  }

  /**
   * Lists all registered tenants.
   * @returns An array of tenant IDs.
   */
  listTenants(): string[] {
    this.logger.log(`[listTenants] Initialize...`)
    return Object.keys(this.tenants)
  }

  /**
   * Creates a connection between two tenants.
   * @param fromTenantId The sender tenant ID.
   * @param toTenantId The receiver tenant ID.
   * @returns An object containing the connection status.
   * @throws Error if the connection cannot be established.
   */
  async createConnection(fromTenantId: string, toTenantId: string): Promise<{ status: string }> {
    const fromAgent = this.getTenantAgent(fromTenantId)
    const toAgent = this.getTenantAgent(toTenantId)

    const connectionExists = await this.hasExistingConnection(fromAgent, toAgent)
    return connectionExists
      ? { status: `Connection between ${fromTenantId} and ${toTenantId} already exists.` }
      : await this.createNewConnection(fromAgent, toAgent, fromTenantId, toTenantId)
  }

  /**
   * Retrieves all connections for a specific tenant.
   * @param tenantId The unique ID of the tenant.
   * @returns An array of connections.
   * @throws Error if connections cannot be retrieved.
   */
  async getConnections(tenantId: string): Promise<any[]> {
    const agent = this.getTenantAgent(tenantId)
    try {
      const connections = await agent.connections.getAll()
      this.logger.log(`[getConnections] Connections retrieved for tenant ${tenantId}`)
      return connections
    } catch (error) {
      this.logger.error(`[getConnections] Error getting connections for tenant ${tenantId}: ${error.message}`)
      throw new Error(`Error getting connections for tenant ${tenantId}: ${error.message}`)
    }
  }

  /**
   * Sends a message between two tenants.
   * @param fromTenantId The sender tenant ID.
   * @param toTenantId The receiver tenant ID.
   * @param message The message content.
   * @returns An object containing the message status and response.
   * @throws Error if the message cannot be sent.
   */
  async sendMessage(
    fromTenantId: string,
    toTenantId: string,
    message: string,
  ): Promise<{ status: string; response: any }> {
    const fromAgent = this.getTenantAgent(fromTenantId)
    const toAgent = this.getTenantAgent(toTenantId)

    const connection = await this.getActiveConnection(fromAgent, toAgent)

    try {
      const response = await fromAgent.basicMessages.sendMessage(connection.id, message)
      const threadId = response.threadId
      const timestamp = new Date().toISOString()

      const messageRecord = { fromTenantId, toTenantId, message, timestamp }

      await this.redisClient.set(`message:${threadId}`, JSON.stringify(messageRecord))
      this.logger.log(`[sendMessage] Message sent from ${fromTenantId} to ${toTenantId}`)
      return { status: `Message sent from ${fromTenantId} to ${toTenantId}`, response }
    } catch (error) {
      this.logger.error(`[sendMessage] Failed to send message: ${error.message}`)
      throw new Error(`Failed to send message: ${error.message}`)
    }
  }

  /**
   * Deletes a tenant and cleans up associated resources.
   * @param tenantId The unique ID of the tenant.
   * @returns An object containing the deletion status.
   * @throws Error if the tenant cannot be deleted.
   */
  async deleteTenant(tenantId: string): Promise<{ status: string }> {
    const tenant = this.tenants[tenantId]
    if (!tenant) {
      this.logger.error(`[deleteTenant] Tenant ${tenantId} does not exist`)
      throw new Error(`Tenant ${tenantId} does not exist`)
    }

    try {
      await tenant.agent.wallet.delete()
      delete this.tenants[tenantId]
      this.logger.log(`[deleteTenant] Tenant ${tenantId} deleted successfully`)
      return { status: `Tenant ${tenantId} has been successfully deleted` }
    } catch (error) {
      this.logger.error(`[deleteTenant] Failed to delete tenant ${tenantId}: ${error.message}`)
      throw new Error(`Failed to delete tenant ${tenantId}: ${error.message}`)
    }
  }

  /**
   * Establishes a new connection between two agents.
   * @param fromAgent The agent initiating the connection.
   * @param toAgent The target agent to connect to.
   * @param fromTenantId The tenant ID of the initiating agent.
   * @param toTenantId The tenant ID of the target agent.
   * @returns An object containing the connection status.
   * @throws Error if the connection cannot be established.
   */
  private async createNewConnection(
    fromAgent: Agent,
    toAgent: Agent,
    fromTenantId: string,
    toTenantId: string,
  ): Promise<{ status: string }> {
    this.logger.debug(
      `[createNewConnection] Creating a new connection from tenant ${fromTenantId} to tenant ${toTenantId}...`,
    )

    try {
      // Generate an invitation from the `toAgent`
      const outOfBandInvitation = (await toAgent.oob.createInvitation({ autoAcceptConnection: true }))
        .outOfBandInvitation
      const invitation = outOfBandInvitation.toUrl({
        domain: process.env.AGENT_INVITATION_BASE_URL ?? 'https://2060.io/i',
      })

      this.logger.debug(`[createNewConnection] Generated invitation for tenant ${toTenantId}: ${invitation}`)

      // Use the `fromAgent` to accept the invitation
      const connectionRecord = await fromAgent.oob.receiveInvitationFromUrl(invitation, {
        acceptInvitationTimeoutMs: 5000,
        autoAcceptConnection: true,
        autoAcceptInvitation: true,
      })

      this.logger.log(
        `[createNewConnection] Connection record created between ${fromTenantId} and ${toTenantId}: ${JSON.stringify(connectionRecord)}`,
      )

      // Log all connections for debugging purposes
      const connections = await fromAgent.connections.getAll()
      this.logger.debug(
        `[createNewConnection] Connections for tenant ${fromTenantId}: ${JSON.stringify(connections, null, 2)}`,
      )

      return {
        status: `Connection established between ${fromTenantId} and ${toTenantId}`,
      }
    } catch (error) {
      this.logger.error(
        `[createNewConnection] Failed to create connection from ${fromTenantId} to ${toTenantId}: ${error.message}`,
      )
      throw new Error(`Failed to establish connection: ${error.message}`)
    }
  }

  /**
   * Finds an active connection between two agents.
   * @param fromAgent The agent sending the message.
   * @param toAgent The agent receiving the message.
   * @returns The active connection record.
   * @throws Error if no active connection is found.
   */
  private async getActiveConnection(fromAgent: Agent<any>, toAgent: Agent<any>): Promise<any> {
    const connections = await fromAgent.connections.getAll()

    const connection = connections.find(
      (conn) => conn.theirLabel === toAgent.config.label && conn.state === 'completed',
    )

    if (!connection) {
      throw new Error(`No active connection between ${fromAgent.config.label} and ${toAgent.config.label}`)
    }

    return connection
  }

  /**
   * Checks if there is an existing connection between two agents.
   * @param fromAgent The agent initiating the connection.
   * @param toAgent The target agent.
   * @returns A boolean indicating whether a connection exists.
   */
  private async hasExistingConnection(fromAgent: Agent<any>, toAgent: Agent<any>): Promise<boolean> {
    const connections = await fromAgent.connections.getAll()

    if (!connections || connections.length === 0) {
      return false
    }

    const connection = connections.find(
      (conn) => conn.theirLabel === toAgent.config.label && conn.state === 'completed',
    )

    return !!connection
  }
}
