#import <Foundation/Foundation.h>
@interface PointRequest : NSObject
- (instancetype)initWithLock:(id)lock clock:(NSTimeInterval (^)(void))clock deadline:(NSTimeInterval)deadline stop:(BOOL (^)(void))stop;
- (void)receive:(id)element error:(NSError *)error;
- (void)markReturned;
- (void)abandon;
- (NSDictionary *)snapshot;
- (NSDictionary *)snapshotWithElement:(id __autoreleasing *)element;
- (id)usableElement;
@end
