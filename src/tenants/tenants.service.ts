import { Injectable } from '@nestjs/common'
import { Agent } from '@credo-ts/core'
import { AgentFactory } from '../lib/agents/agent.factory'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'

@Injectable()
export class TenantsService {
  private tenants: Record<string, { agent: Agent<any> }> = {}

  constructor(
    private readonly agentFactory: AgentFactory,
    @InjectRedis() private readonly redisClient: Redis,
  ) {}

  async createTenant(tenantId: string, config: any): Promise<{ status: string }> {
    if (this.tenants[tenantId]) {
      throw new Error(`Tenant ${tenantId} already exists`)
    }

    const agent = await this.agentFactory.createAgent(tenantId)

    this.tenants[tenantId] = { agent }

    return { status: `Tenant ${tenantId} created successfully` }
  }

  getTenantAgent(tenantId: string): Agent<any> {
    if (!this.tenants[tenantId]) {
      throw new Error(`Tenant ${tenantId} not found`)
    }
    return this.tenants[tenantId].agent
  }

  listTenants(): string[] {
    return Object.keys(this.tenants)
  }

  async createConnection(fromTenantId: string, toTenantId: string): Promise<{ status: string }> {
    const fromAgent = this.getTenantAgent(fromTenantId)
    const toAgent = this.getTenantAgent(toTenantId)

    // Check if a connection already exists
    const connectionExists = await this.hasExistingConnection(fromAgent, toAgent)

    return connectionExists
      ? { status: `Connection between ${fromTenantId} and ${toTenantId} already exists.` }
      : await this.createNewConnection(fromAgent, toAgent, fromTenantId, toTenantId)
  }

  async getConnections(tenantId: string): Promise<any[]> {
    const agent = this.getTenantAgent(tenantId)
    try {
      const connections = await agent.connections.getAll()
      return connections
    } catch (error) {
      throw new Error(`Error getting connections for tenant ${tenantId}: ${error.message}`)
    }
  }

  async sendMessage(
    fromTenantId: string,
    toTenantId: string,
    message: string,
  ): Promise<{ status: string; response: any }> {
    const fromAgent = this.getTenantAgent(fromTenantId)
    const toAgent = this.getTenantAgent(toTenantId)

    // Get the active connection between the agents
    const connection = await this.getActiveConnection(fromAgent, toAgent)

    // Send the message to the receiver agent
    try {
      const response = await fromAgent.basicMessages.sendMessage(connection.id, message)
      // Extract threadId and store message details in Redis
      const threadId = response.threadId
      const timestamp = new Date().toISOString()

      const messageRecord = {
        fromTenantId,
        toTenantId,
        message,
        timestamp,
      }

      // Save the message in Redis with threadId as the key
      await this.redisClient.set(`message:${threadId}`, JSON.stringify(messageRecord))
      
      return { status: `Message sent from ${fromTenantId} to ${toTenantId}`, response }
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`)
    }
  }

  private async createNewConnection(
    fromAgent: Agent,
    toAgent: Agent,
    fromTenantId: string,
    toTenantId: string,
  ): Promise<{ status: string }> {
    // Generate an invitation from the `toAgent`
    const outOfBandInvitation = (await toAgent.oob.createInvitation({ autoAcceptConnection: true })).outOfBandInvitation
    const invitation = outOfBandInvitation.toUrl({
      domain: process.env.AGENT_INVITATION_BASE_URL ?? 'https://2060.io/i',
    })

    // Use the `fromAgent` to accept the invitation
    const connectionRecord = await fromAgent.oob.receiveInvitationFromUrl(invitation, {
      acceptInvitationTimeoutMs: 5000,
      autoAcceptConnection: true,
      autoAcceptInvitation: true,
    })

    // Log the connections for debugging purposes
    const connections = await fromAgent.connections.getAll()
    console.log(`Connections fromAgent ${JSON.stringify(connections, null, 2)}`)

    return {
      status: `Connection established between ${fromTenantId} and ${toTenantId}`,
    }
  }

  async deleteTenant(tenantId: string): Promise<{ status: string }> {
    const tenant = this.tenants[tenantId]

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} does not exist`)
    }

    const agent = tenant.agent

    try {
      // Stop the agent and clean up resources
      await agent.wallet.delete()
      //await agent.shutdown()

      // Remove the tenant from memory
      delete this.tenants[tenantId]

      return { status: `Tenant ${tenantId} has been successfully deleted` }
    } catch (error) {
      throw new Error(`Failed to delete tenant ${tenantId}: ${error.message}`)
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
