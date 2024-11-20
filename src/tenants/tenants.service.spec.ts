import { Test, TestingModule } from '@nestjs/testing'
import { TenantsService } from './tenants.service'
import { AgentFactory } from '../lib/agents/agent.factory'
import Redis from 'ioredis'

describe('TenantsService', () => {
  let service: TenantsService
  let agentFactoryMock: AgentFactory
  let redisMock: Redis

  beforeEach(async () => {
    // Mock AgentFactory
    agentFactoryMock = {
      createAgent: jest.fn().mockResolvedValue({
        config: { label: 'mockLabel' },
        connections: {
          getAll: jest.fn().mockResolvedValue([{ theirLabel: 'mockLabel', state: 'completed' }]),
        },
        basicMessages: {
          sendMessage: jest.fn().mockResolvedValue({ threadId: 'mockThreadId' }),
        },
        wallet: {
          delete: jest.fn().mockResolvedValue(true),
        },
      }),
    } as unknown as AgentFactory

    // Mock Redis
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      keys: jest.fn().mockResolvedValue([]),
      flushall: jest.fn().mockResolvedValue('OK'),
    } as unknown as Redis

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: AgentFactory, useValue: agentFactoryMock },
        { provide: 'default_IORedisModuleConnectionToken', useValue: redisMock },
      ],
    }).compile()

    service = module.get<TenantsService>(TenantsService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('createTenant', () => {
    it('should create a tenant successfully', async () => {
      const tenantId = 'TestTenant'
      const config = {}

      const result = await service.createTenant(tenantId, config)

      expect(agentFactoryMock.createAgent).toHaveBeenCalledWith(tenantId)
      expect(result).toEqual({ status: `Tenant ${tenantId} created successfully` })
    })

    it('should throw an error if tenant already exists', async () => {
      const tenantId = 'ExistingTenant'
      service['tenants'][tenantId] = { agent: {} as any }

      await expect(service.createTenant(tenantId, {})).rejects.toThrowError(`Tenant ${tenantId} already exists`)
    })
  })

  describe('getTenantAgent', () => {
    it('should return the agent of an existing tenant', () => {
      const tenantId = 'ExistingTenant'
      const mockAgent = { id: 'mockAgent' } as any
      service['tenants'][tenantId] = { agent: mockAgent }

      const result = service.getTenantAgent(tenantId)

      expect(result).toEqual(mockAgent)
    })

    it('should throw an error if tenant does not exist', () => {
      const tenantId = 'NonExistentTenant'

      expect(() => service.getTenantAgent(tenantId)).toThrowError(`Tenant ${tenantId} not found`)
    })
  })

  describe('listTenants', () => {
    it('should return a list of tenant IDs', () => {
      service['tenants'] = {
        Tenant1: { agent: {} as any },
        Tenant2: { agent: {} as any },
      }

      const result = service.listTenants()

      expect(result).toEqual(['Tenant1', 'Tenant2'])
    })
  })

  describe('createConnection', () => {
    it('should create a new connection if none exists', async () => {
      const fromTenantId = 'Tenant1'
      const toTenantId = 'Tenant2'
      const fromAgentMock = {
        config: { label: fromTenantId },
        connections: {
          getAll: jest.fn().mockResolvedValue([]),
        },
      }
      const toAgentMock = { config: { label: toTenantId } }

      service['tenants'][fromTenantId] = { agent: fromAgentMock as any }
      service['tenants'][toTenantId] = { agent: toAgentMock as any }

      jest.spyOn(service as any, 'createNewConnection').mockResolvedValue({
        status: `Connection established between ${fromTenantId} and ${toTenantId}`,
      })

      const result = await service.createConnection(fromTenantId, toTenantId)

      expect(result).toEqual({
        status: `Connection established between ${fromTenantId} and ${toTenantId}`,
      })
    })

    it('should return status if connection already exists', async () => {
      const fromTenantId = 'Tenant1'
      const toTenantId = 'Tenant2'
      const fromAgentMock = {
        config: { label: fromTenantId },
        connections: {
          getAll: jest.fn().mockResolvedValue([{ theirLabel: toTenantId, state: 'completed' }]),
        },
      }
      const toAgentMock = { config: { label: toTenantId } }

      service['tenants'][fromTenantId] = { agent: fromAgentMock as any }
      service['tenants'][toTenantId] = { agent: toAgentMock as any }

      const result = await service.createConnection(fromTenantId, toTenantId)

      expect(result).toEqual({
        status: `Connection between ${fromTenantId} and ${toTenantId} already exists.`,
      })
    })
  })

  describe('deleteTenant', () => {
    it('should delete a tenant successfully', async () => {
      const tenantId = 'TestTenant'
      const mockAgent = {
        wallet: { delete: jest.fn().mockResolvedValue(true) },
      }

      service['tenants'][tenantId] = { agent: mockAgent as any }

      const result = await service.deleteTenant(tenantId)

      expect(mockAgent.wallet.delete).toHaveBeenCalled()
      expect(service['tenants'][tenantId]).toBeUndefined()
      expect(result).toEqual({ status: `Tenant ${tenantId} has been successfully deleted` })
    })

    it('should throw an error if tenant does not exist', async () => {
      const tenantId = 'NonExistentTenant'

      await expect(service.deleteTenant(tenantId)).rejects.toThrowError(`Tenant ${tenantId} does not exist`)
    })
  })
})
