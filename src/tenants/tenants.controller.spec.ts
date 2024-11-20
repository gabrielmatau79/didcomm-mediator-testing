import { Test, TestingModule } from '@nestjs/testing'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'

describe('TenantsController', () => {
  let controller: TenantsController
  let service: TenantsService

  beforeEach(async () => {
    // Mock TenantsService
    const serviceMock = {
      createTenant: jest.fn().mockResolvedValue({ status: 'Tenant created successfully' }),
      getTenantAgent: jest.fn().mockResolvedValue({ id: 'mockAgent' }),
      listTenants: jest.fn().mockResolvedValue(['Tenant1', 'Tenant2']),
      createConnection: jest.fn().mockResolvedValue({ status: 'Connection established' }),
      getConnections: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ status: 'Message sent' }),
      deleteTenant: jest.fn().mockResolvedValue({ status: 'Tenant deleted successfully' }),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantsController],
      providers: [{ provide: TenantsService, useValue: serviceMock }],
    }).compile()

    controller = module.get<TenantsController>(TenantsController)
    service = module.get<TenantsService>(TenantsService)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('createTenant', () => {
    it('should call TenantsService.createTenant and return its result', async () => {
      const tenantId = 'Tenant1'
      const config = {}

      const result = await controller.createTenant(tenantId, config)

      expect(service.createTenant).toHaveBeenCalledWith(tenantId, config)
      expect(result).toEqual({ status: 'Tenant created successfully' })
    })
  })

  describe('listTenants', () => {
    it('should call TenantsService.listTenants and return its result', async () => {
      service['tenants'] = {
        Tenant1: { agent: {} as any },
        Tenant2: { agent: {} as any },
      }

      const result = await controller.listTenants()

      expect(service.listTenants).toHaveBeenCalled()
      expect(result).toEqual(['Tenant1', 'Tenant2'])
    })
  })

  describe('getTenant', () => {
    it('should call TenantsService.getTenantAgent and return its result', async () => {
      const tenantId = 'Tenant1'

      const result = await controller.getTenant(tenantId)

      expect(service.getTenantAgent).toHaveBeenCalledWith(tenantId)
      expect(result).toEqual({ id: 'mockAgent' })
    })
  })

  describe('deleteTenant', () => {
    it('should call TenantsService.deleteTenant and return its result', async () => {
      const tenantId = 'Tenant1'

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      await controller.deleteTenant(tenantId, mockRes)

      expect(service.deleteTenant).toHaveBeenCalledWith(tenantId)
      expect(mockRes.status).toHaveBeenCalledWith(200) // Verifica que se llame con el código HTTP correcto
      expect(mockRes.json).toHaveBeenCalledWith({ status: 'Tenant deleted successfully' }) // Verifica el contenido de la respuesta
    })

    it('should return an error if TenantsService.deleteTenant throws an error', async () => {
      const tenantId = 'NonExistentTenant'
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      }

      jest.spyOn(service, 'deleteTenant').mockRejectedValueOnce(new Error('Tenant not found'))

      await controller.deleteTenant(tenantId, mockRes)

      expect(service.deleteTenant).toHaveBeenCalledWith(tenantId)
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({ status: false, error: 'Tenant not found' })
    })
  })
})
