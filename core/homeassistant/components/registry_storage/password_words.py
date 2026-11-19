"""Ranked word lists for the password estimate.

These lists were written for this integration and are covered by the licence of this
repository. They are not copied from any third-party word list. The order is an
approximate ranking from very common to less common; the estimate treats a word's
position as the number of guesses an attacker needs to reach it, so a small list is
conservative only for the words it contains. Words that are not listed are still
priced as likely words when they look like ordinary words (see passwords.py).
"""

from typing import Final


def _words(text: str) -> tuple[str, ...]:
    return tuple(text.split())


# Passwords that appear again and again in leaked password collections, and the
# phrases people reach for when asked for a "long" password.
COMMON_PASSWORDS: Final = _words(
    """
password 123456 123456789 12345678 12345 qwerty 1234567 111111 123123 abc123
password1 1234567890 000000 iloveyou 1q2w3e4r qwerty123 qwertyuiop 654321 666666
121212 dragon monkey letmein football baseball sunshine princess welcome shadow
superman master michael jennifer jordan hunter trustno1 batman starwars computer
whatever freedom ashley charlie donald login admin administrator root changeme
secret passw0rd p4ssw0rd pa55word access mustang killer soccer hockey ranger
buster thomas tigger robert daniel jessica andrew pepper ginger summer winter
cheese hello hello123 flower lovely love loveme iloveu cookie chocolate snoopy
matrix hannah maggie harley joshua jordan23 michelle nicole pokemon minecraft
fortnite roblox liverpool chelsea arsenal barcelona yankees cowboys eagles
steelers lakers qazwsx zaq12wsx 1qaz2wsx asdfgh asdfghjkl zxcvbn zxcvbnm
qweasd qweasdzxc 1q2w3e qwe123 asd123 zxc123 aaaaaa abcdef abcdefg abcd1234
test test123 testing guest default system internet google samsung apple
homeassistant hassio raspberry raspberrypi docker registry camera backup
opensesame letmein1 welcome1 password123 passwordpassword correcthorsebatterystaple
correcthorse batterystaple ihateyou fuckyou fuckoff blink182 jesus god angel
angels heaven rainbow butterfly unicorn purple orange banana lemon cherry
"""
)

# Common English words, roughly most frequent first.
COMMON_WORDS: Final = _words(
    """
the be to of and in that have it for not on with he as you do at this but his by
from they we say her she or an will my one all would there their what so up out
if about who get which go me when make can like time no just him know take people
into year your good some could them see other than then now look only come its
over think also back after use two how our work first well way even new want
because any these give day most us is are was were been has had did said made
went got man men woman women child children world life hand part place case week
company system program question work government number night point home water room
mother father area money story fact month lot right study book eye job word
business issue side kind head house service friend power hour game line end member
law car city community name president team minute idea kid body information school
face others level office door health person art war history party result change
morning reason research girl guy moment air teacher force education foot boy age
policy everything process music market sense nation plan college interest death
experience effect class control care field development role effort rate heart drug
show leader light voice wife police mind price report decision son view relationship
town road arm difference value building action model season society tax director
position player record paper space ground form event official matter center couple
site project activity star table need court oil situation cost industry figure
street image phone data picture practice piece land product doctor wall patient
worker news test movie north love support technology step baby computer type
attention film tree source organization hair window evidence population site
truth bird fish horse cow sheep chicken duck mouse rabbit tiger lion
bear fox deer snake frog bee spider whale shark dolphin monkey eagle owl
red blue green yellow black white orange purple pink brown gray grey silver gold
one two three four five six seven eight nine ten eleven twelve hundred thousand
million first second third last next little small big large great old young long
short high low good bad best better worse worst happy sad hot cold warm cool new
early late easy hard soft strong weak fast slow quick quiet loud dark bright clean
dirty rich poor free full empty open close real true false sure simple special
january february march april may june july august september october november
december monday tuesday wednesday thursday friday saturday sunday spring summer
autumn fall winter today tomorrow yesterday morning evening afternoon weekend
sun moon star sky cloud rain snow wind storm fire ice stone rock sand river lake
sea ocean mountain hill valley forest wood island beach desert field garden park
flower rose lily daisy tulip grass leaf root seed fruit apple banana cherry lemon
orange grape peach pear plum berry melon mango coffee tea milk bread butter cheese
egg meat rice sugar salt pepper honey cake cookie pizza pasta soup salad candy
chocolate cream juice wine beer water dinner lunch breakfast food kitchen table
chair bed sofa lamp clock mirror window door roof floor wall house home garage
street city town village country state world earth planet space rocket ship boat
train plane car truck bus bike bicycle road bridge tower castle church school
office shop store market bank hotel hospital library museum station airport
king queen prince princess knight dragon wizard magic sword shield crown castle
angel devil ghost monster hero villain pirate ninja alien zombie vampire
mother father brother sister son daughter uncle aunt cousin family friend baby
husband wife boyfriend girlfriend lover darling honey sweet sweetie cutie
music song dance party game play player sport football soccer tennis golf hockey
baseball basketball cricket rugby boxing racing swimming running chess poker
guitar piano drum violin trumpet radio movie film video photo picture camera
phone computer laptop tablet internet email online password secret login user
account admin server network device keyboard mouse screen monitor printer
red green blue happy lucky crazy cool super mega ultra power master killer
shadow storm thunder lightning blaze flame frost steel iron silver golden
diamond crystal jewel pearl ruby emerald sapphire treasure coin money cash
freedom liberty justice peace hope faith trust truth honor glory victory
spirit soul heart mind dream wish smile laugh tears kiss hug life death
time space light dark night day sunrise sunset rainbow paradise heaven hell
nature animal pet kitten bunny teddy panda koala penguin turtle
apple orange banana mango tomato potato carrot onion garlic pepper bean corn
table window garden kitchen bathroom bedroom basement attic hallway balcony
north south east west left right up down top bottom front back middle center
word letter number name sign mark note list page book story poem novel
school class lesson teacher student college university exam grade test
work job career boss office meeting project task plan goal team staff
health doctor nurse medicine pill hospital body head hand foot leg arm eye ear
nose mouth tooth hair skin bone blood heart brain face neck back finger
river ocean island lake pond stream waterfall cave canyon cliff volcano
correct horse battery staple capital welcome summer winter spring autumn
troubadour troubador
"""
)
