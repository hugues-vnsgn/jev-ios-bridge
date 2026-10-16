#import <Foundation/Foundation.h>
// Fixed native discovery boundary; no element query occurs during discovery.
@interface ReferenceAccess : NSObject
- (NSString *)validityAttribute;
- (id)rootFactory;
- (NSDictionary *)validityProvenanceForClient:(id)client;
- (NSDictionary *)rootFactoryProvenance;
- (NSDictionary *)equalityProvenanceForElement:(id)element;
@end
