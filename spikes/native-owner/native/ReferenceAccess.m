#import "ReferenceAccess.h"
#import "NativeProvenance.h"
#import <dlfcn.h>
@implementation ReferenceAccess
- (NSString *)validityAttribute {
  void *address = dlsym(RTLD_DEFAULT, "XC_kAXXCAttributeIsValid");
  if (!address) return nil;
  id value = *(__unsafe_unretained id *)address;
  return [value isKindOfClass:NSString.class] && [value length] > 0
    && [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding] <= 1024 ? value : nil;
}
- (id)rootFactory { return NSClassFromString(@"XCAccessibilityElement"); }
- (NSDictionary *)validityProvenanceForClient:(id)client {
  NSDictionary *symbol = LoadedAddressProvenance(dlsym(RTLD_DEFAULT, "XC_kAXXCAttributeIsValid"));
  NSDictionary *method = LoadedMethodProvenance(client, NSSelectorFromString(@"attributesForElement:attributes:error:"));
  return symbol && method ? @{@"symbol":symbol,@"method":method} : nil;
}
- (NSDictionary *)rootFactoryProvenance {
  return LoadedMethodProvenance(self.rootFactory, NSSelectorFromString(@"elementWithProcessIdentifier:"));
}
- (NSDictionary *)equalityProvenanceForElement:(id)element {
  Class owner = NSClassFromString(@"XCAccessibilityElement");
  if (!owner || ![element isKindOfClass:owner]) return nil;
  return LoadedMethodProvenance(element, @selector(isEqual:));
}
@end
