import struct
from ios_package_compat import audit_macho, slices

def binary(platform=2):
 command=struct.pack('<6I',0x32,24,platform,0xF0000,0x1A0000,0)
 return struct.pack('<8I',0xFEEDFACF,0x100000C,0,6,1,len(command),0,0)+command
assert audit_macho(binary())==[{'architecture':'arm64','platform':'iphoneos','signed':False}]
try:audit_macho(binary(7))
except ValueError as e:assert 'PLATFORM' in str(e)
else:raise AssertionError('Simulator binary accepted')
thin=binary();fat=struct.pack('>II5I',0xCAFEBABE,1,0x100000C,0,32,len(thin),2)+b'\0'*4+thin
assert len(audit_macho(fat))==1
try:slices(struct.pack('>II5I',0xCAFEBABE,1,0x100000C,0,9999,100,2))
except ValueError:pass
else:raise AssertionError('Invalid fat bounds accepted')
print('iOS package audit: real arm64 platform, simulator rejection and fat bounds passed.')
